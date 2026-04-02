import os
import pickle
import torch
import psycopg
import re
from sentence_transformers import SentenceTransformer
from pgvector.psycopg import register_vector
from psycopg import sql
from psycopg.types.json import Json
import hashlib

DEFAULT_MODEL_NAME = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
_model = None
_model_name = None


def get_table_embedding_dim(conn, table_name: str) -> int | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT format_type(a.atttypid, a.atttypmod)
            FROM pg_attribute a
            JOIN pg_class c ON a.attrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE c.relname = %s
              AND n.nspname = current_schema()
              AND a.attname = 'embedding'
              AND NOT a.attisdropped
            """,
            (table_name,),
        )
        row = cur.fetchone()

    if not row or not row[0]:
        return None

    match = re.search(r"vector\((\d+)\)", row[0])
    if not match:
        return None
    return int(match.group(1))


def resolve_table_name(conn, base_table_name: str, embedding_dim: int) -> str:
    configured_table = os.getenv("VECTOR_TABLE_NAME", base_table_name)
    existing_dim = get_table_embedding_dim(conn, configured_table)

    if existing_dim is None or existing_dim == embedding_dim:
        return configured_table

    fallback_table = f"{configured_table}_{embedding_dim}"
    return fallback_table


def list_vector_tables(conn, base_table_name: str) -> list[str]:
    configured_table = os.getenv("VECTOR_TABLE_NAME", base_table_name)
    pattern = f"{configured_table}%"

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.relname
            FROM pg_class c
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE c.relkind = 'r'
              AND n.nspname = current_schema()
              AND c.relname LIKE %s
            ORDER BY c.relname
            """,
            (pattern,),
        )
        return [row[0] for row in cur.fetchall()]


def get_model(model_name: str = DEFAULT_MODEL_NAME):
    global _model, _model_name
    if model_name != _model_name:
        _model = None

    if _model is None:
        print(f"--- Loading {model_name} (this may take a minute) ---")
        _model = SentenceTransformer(model_name)
        _model_name = model_name
        print(f"Device: {_model.device}")
    return _model


def generate_bge_embeddings(data_chunks, model_name=DEFAULT_MODEL_NAME, save_path="vector_cache.pkl"):
    """
    Converts PDF text chunks into sentence embeddings.
    
    Args:
        data_chunks (list): List of dicts with 'content' and 'metadata'
        model_name (str): The HuggingFace model ID
        save_path (str): Where to store the vectors on disk
        
    Returns:
        tuple: (embeddings_array, updated_chunks)
    """
    
    # 1. Check for existing cache to save time/compute
    if save_path and os.path.exists(save_path):
        print(f"--- Loading cached embeddings from {save_path} ---")
        with open(save_path, 'rb') as f:
            cached_data = pickle.load(f)
        return cached_data['embeddings'], cached_data['chunks']

    # 2. Load Model on demand so service startup stays fast/healthy
    model = get_model(model_name)
    
    # Optional: Use FP16 for speed if on GPU
    if torch.cuda.is_available():
        model.half()

    # 3. Extract text strings
    texts = [chunk['content'] for chunk in data_chunks]

    # 4. Generate Embeddings
    print(f"--- Encoding {len(texts)} chunks ---")
    # batch_size 12 is a safe middle ground for 8GB RAM/VRAM
    embeddings = model.encode(
        texts, 
        batch_size=12, 
        show_progress_bar=True, 
        convert_to_numpy=True
    )

    # 5. Save to disk
    if save_path:
        with open(save_path, 'wb') as f:
            pickle.dump({'embeddings': embeddings, 'chunks': data_chunks}, f)
        print(f"--- Saved embeddings to {save_path} ---")

    return embeddings, data_chunks


def save_embeddings_to_pgvector(
    embeddings,
    data_chunks,
    db_url=None,
    table_name="document_embeddings",
    dedupe_similarity_threshold=None,
):
    """
    Save generated embeddings and their source chunks to a PostgreSQL pgvector table.

    Args:
        embeddings: Numpy array or list of embedding vectors
        data_chunks (list): List of dicts with 'content' and 'metadata'
        db_url (str | None): PostgreSQL connection string. Falls back to DATABASE_URL.
        table_name (str): Target table name

    Returns:
        int: Number of inserted rows
    """

    if len(embeddings) != len(data_chunks):
        raise ValueError("embeddings and data_chunks must have the same length")

    if len(embeddings) == 0:
        return 0

    db_url = db_url or os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("Provide db_url or set the DATABASE_URL environment variable")

    if isinstance(embeddings[0], str):
        raise ValueError("embeddings must be numeric vectors, got string data")

    embedding_dim = len(embeddings[0])

    rows = []
    for chunk, embedding in zip(data_chunks, embeddings):
        content = chunk["content"]
        metadata = Json(chunk.get("metadata", {}))
        vector_value = embedding.tolist() if hasattr(embedding, "tolist") else embedding
        content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        rows.append((content, metadata, vector_value, content_hash))

    with psycopg.connect(db_url) as conn:
        register_vector(conn)
        resolved_table_name = resolve_table_name(conn, table_name, embedding_dim)

        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
            cur.execute(
                sql.SQL(
                    """
                CREATE TABLE IF NOT EXISTS {} (
                    id BIGSERIAL PRIMARY KEY,
                    content TEXT NOT NULL,
                    metadata JSONB,
                    embedding VECTOR({}) NOT NULL,
                    content_hash TEXT UNIQUE
                )
                """
                ).format(sql.Identifier(resolved_table_name), sql.SQL(str(embedding_dim)))
            )
            cur.execute(
                sql.SQL(
                    """
                CREATE INDEX IF NOT EXISTS {} ON {} USING ivfflat (embedding vector_cosine_ops)
                """
                ).format(
                    sql.Identifier(f"{resolved_table_name}_embedding_idx"),
                    sql.Identifier(resolved_table_name),
                )
            )
            insert_sql = sql.SQL(
                """
            INSERT INTO {} (content, metadata, embedding, content_hash)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (content_hash) DO NOTHING
            """
            ).format(sql.Identifier(resolved_table_name))

            if dedupe_similarity_threshold is None:
                cur.executemany(insert_sql, rows)
            else:
                for content, metadata, vector_value, content_hash in rows:
                    cur.execute(
                        sql.SQL(
                            """
                        SELECT 1
                        FROM {}
                        WHERE embedding <=> %s < %s
                        LIMIT 1
                        """
                        ).format(sql.Identifier(resolved_table_name)),
                        (vector_value, dedupe_similarity_threshold),
                    )
                    if cur.fetchone():
                        continue
                    cur.execute(insert_sql, (content, metadata, vector_value, content_hash))

        conn.commit()

    return len(rows)

def semantic_search(db_url, query_text, limit=5, table_name="document_embeddings", min_similarity=0.2):
    model = get_model()
    query_vector = model.encode(query_text)
    embedding_dim = len(query_vector)

    with psycopg.connect(db_url) as conn:
        register_vector(conn)
        resolved_table_name = resolve_table_name(conn, table_name, embedding_dim)
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    """
                SELECT content, metadata, 1 - (embedding <=> %s) AS similarity
                FROM {}
                WHERE 1 - (embedding <=> %s) >= %s
                ORDER BY similarity DESC
                LIMIT %s
                """
                ).format(sql.Identifier(resolved_table_name)),
                (query_vector, query_vector, min_similarity, limit),
            )
            rows = cur.fetchall()

    results = []
    for content, metadata, similarity in rows:
        results.append(
            {
                "content": content,
                "metadata": metadata,
                "similarity": float(similarity),
            }
        )
    return results


def delete_document_embeddings(db_url, source_name, table_name="document_embeddings"):
    if not db_url:
        raise ValueError("Provide db_url or set the DATABASE_URL environment variable")

    deleted_rows = 0

    with psycopg.connect(db_url) as conn:
        register_vector(conn)
        table_names = list_vector_tables(conn, table_name)

        with conn.cursor() as cur:
            for candidate_table in table_names:
                cur.execute(
                    sql.SQL(
                        """
                        DELETE FROM {}
                        WHERE metadata->>'source' = %s
                        """
                    ).format(sql.Identifier(candidate_table)),
                    (source_name,),
                )
                deleted_rows += cur.rowcount

        conn.commit()

    return deleted_rows

# --- EXAMPLE USAGE ---
# chunks = pdf_to_markdown_chunks("my_doc.pdf") # From our previous 'fitz' function
# vectors, metadata = generate_bge_embeddings(chunks)

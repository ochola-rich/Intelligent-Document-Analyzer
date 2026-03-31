from sentence_transformers import SentenceTransformer
import os
import pickle
import torch
import psycopg
from pgvector.psycopg import register_vector
from psycopg import sql
from psycopg.types.json import Json

# Load the model. It will use your GPU automatically if available.
model = SentenceTransformer('BAAI/bge-m3')

# Check if it's using CUDA (NVIDIA GPU) or CPU
print(f"Device: {model.device}")

def generate_bge_embeddings(data_chunks, model_name='BAAI/bge-m3', save_path="vector_cache.pkl"):
    """
    Converts PDF text chunks into BGE-M3 embeddings.
    
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

    # 2. Load Model (Detects GPU automatically)
    print(f"--- Loading {model_name} (this may take a minute) ---")
    model = SentenceTransformer(model_name)
    
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

    embedding_dim = len(embeddings[0])

    rows = [
        (
            chunk["content"],
            Json(chunk.get("metadata", {})),
            embedding.tolist() if hasattr(embedding, "tolist") else embedding,
        )
        for chunk, embedding in zip(data_chunks, embeddings)
    ]

    with psycopg.connect(db_url) as conn:
        register_vector(conn)

        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
            cur.execute(
                sql.SQL(
                    """
                CREATE TABLE IF NOT EXISTS {} (
                    id BIGSERIAL PRIMARY KEY,
                    content TEXT NOT NULL,
                    metadata JSONB,
                    embedding VECTOR({}) NOT NULL
                )
                """
                ).format(sql.Identifier(table_name), sql.SQL(str(embedding_dim)))
            )
            cur.executemany(
                sql.SQL(
                    """
                INSERT INTO {} (content, metadata, embedding)
                VALUES (%s, %s, %s)
                """
                ).format(sql.Identifier(table_name)),
                rows,
            )

        conn.commit()

    return len(rows)

# --- EXAMPLE USAGE ---
# chunks = pdf_to_markdown_chunks("my_doc.pdf") # From our previous 'fitz' function
# vectors, metadata = generate_bge_embeddings(chunks)

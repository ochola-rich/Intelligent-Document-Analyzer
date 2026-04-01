import psycopg
from vector import register_vector

def semantic_search_db(query_text, model, db_url, limit=5):
    # 1. Embed the user's query locally
    query_vector = model.encode(query_text)
    
    with psycopg.connect(db_url) as conn:
        register_vector(conn)
        with conn.cursor() as cur:
            # We use the <=> operator (Cosine Distance)
            # 1 - distance = Similarity score
            cur.execute("""
                SELECT content, metadata, 1 - (embedding <=> %s) AS similarity
                FROM document_embeddings
                ORDER BY similarity DESC
                LIMIT %s;
            """, (query_vector, limit))
            
            return cur.fetchall()
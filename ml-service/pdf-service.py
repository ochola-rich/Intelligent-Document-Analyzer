from fastapi import FastAPI, File, UploadFile
from fastapi.responses import PlainTextResponse
from processor import pdf_to_markdown_chunks
import vector
import hashlib
import os
import uuid
from pydantic import BaseModel, Field

app = FastAPI()

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    raw_bytes = await file.read()
    file_hash = hashlib.sha256(raw_bytes).hexdigest()

    safe_name = os.path.basename(file.filename or "upload.pdf")
    tmp_path = f"/tmp/{uuid.uuid4().hex}_{safe_name}"
    with open(tmp_path, "wb") as f:
        f.write(raw_bytes)

    processed_pages = pdf_to_markdown_chunks(tmp_path)
    cache_path = f"/tmp/vector_cache_{file_hash}.pkl"
    embeddings, data_chunks = vector.generate_bge_embeddings(processed_pages, save_path=cache_path)
    print(f"Generated {len(embeddings)} embeddings for {len(data_chunks)} chunks")
    inserted_rows = vector.save_embeddings_to_pgvector(embeddings, data_chunks)
    print(f"Inserted {inserted_rows} rows into pgvector")
    return {"status": "saved", "pages": len(processed_pages)}

class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    limit: int = Field(5, ge=1, le=50)
    min_similarity: float = Field(0.2, ge=0.0, le=1.0)

@app.post("/search")
def search_docs(request: SearchRequest):
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        return {"status": "error", "detail": "DATABASE_URL not set"}
    results = vector.semantic_search(
        db_url,
        request.query,
        limit=request.limit,
        min_similarity=request.min_similarity,
    )
    return {"query": request.query, "results": results}
@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", response_class=PlainTextResponse)
def something() -> str:
    return "hello world"

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8081)

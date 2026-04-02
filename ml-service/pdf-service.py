from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
import hashlib
import os
import threading
import uuid
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field
from processor import pdf_to_markdown_chunks
import vector

app = FastAPI()
jobs_lock = threading.Lock()
jobs: dict[str, dict] = {}
job_executor = ProcessPoolExecutor(max_workers=int(os.getenv("INGEST_WORKERS", "1")))


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def set_job_state(job_id: str, **updates) -> dict:
    with jobs_lock:
        existing = jobs.get(job_id, {})
        merged = {**existing, **updates}
        jobs[job_id] = merged
        return dict(merged)


def process_pdf_job(tmp_path: str, file_hash: str, source_name: str):
    try:
        processed_pages = pdf_to_markdown_chunks(tmp_path, source_name=source_name)
        cache_path = f"/tmp/vector_cache_{file_hash}.pkl"
        embeddings, data_chunks = vector.generate_bge_embeddings(processed_pages, save_path=cache_path)
        print(f"Generated {len(embeddings)} embeddings for {len(data_chunks)} chunks")
        inserted_rows = 0
        warning = None
        db_url = os.getenv("DATABASE_URL")
        if db_url:
            inserted_rows = vector.save_embeddings_to_pgvector(embeddings, data_chunks, db_url=db_url)
            print(f"Inserted {inserted_rows} rows into pgvector")
        else:
            warning = "DATABASE_URL not set; embeddings were generated but not stored in pgvector"
            print(warning)
        return {
            "status": "processed",
            "pages": len(processed_pages),
            "inserted_rows": inserted_rows,
            "error": warning,
        }
    except Exception as exc:
        print(f"Background processing failed for {tmp_path}: {exc}")
        return {
            "status": "failed",
            "pages": None,
            "inserted_rows": None,
            "error": str(exc),
        }
    finally:
        try:
            os.remove(tmp_path)
        except FileNotFoundError:
            pass


def finalize_job(job_id: str, future):
    try:
        result = future.result()
    except Exception as exc:
        set_job_state(job_id, status="failed", completed_at=utc_now(), error=str(exc))
        return

    set_job_state(
        job_id,
        status=result.get("status", "failed"),
        completed_at=utc_now(),
        pages=result.get("pages"),
        inserted_rows=result.get("inserted_rows"),
        error=result.get("error"),
    )


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    raw_bytes = await file.read()
    file_hash = hashlib.sha256(raw_bytes).hexdigest()

    safe_name = os.path.basename(file.filename or "upload.pdf")
    tmp_path = f"/tmp/{uuid.uuid4().hex}_{safe_name}"
    with open(tmp_path, "wb") as f:
        f.write(raw_bytes)

    job_id = uuid.uuid4().hex
    set_job_state(
        job_id,
        id=job_id,
        filename=safe_name,
        status="queued",
        created_at=utc_now(),
        completed_at=None,
        pages=None,
        inserted_rows=None,
        error=None,
    )
    job = set_job_state(job_id, status="processing", started_at=utc_now())
    future = job_executor.submit(process_pdf_job, tmp_path, file_hash, safe_name)
    future.add_done_callback(lambda completed_future: finalize_job(job_id, completed_future))
    return JSONResponse(status_code=202, content=job)

class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    model: str = Field("semantic-search")
    limit: int = Field(5, ge=1, le=50)
    min_similarity: float = Field(0.2, ge=0.0, le=1.0)


def build_contextual_answer(query: str, results: list[dict]) -> str:
    if not results:
        return "I could not find grounded context for that question in the indexed documents."

    snippets = []
    for item in results[:3]:
        metadata = item.get("metadata") or {}
        source = metadata.get("source") or "unknown source"
        page = metadata.get("page")
        location = f"{source}, page {page}" if page else source
        content = " ".join((item.get("content") or "").split())
        if not content:
            continue
        trimmed = content[:320].rstrip()
        if len(content) > 320:
            trimmed += "..."
        snippets.append(f"[{location}] {trimmed}")

    if not snippets:
        return (
            f'I found supporting matches for "{query}", but the retrieved chunks were empty, '
            "so I could not assemble a grounded answer."
        )

    return (
        f'Context-grounded answer for "{query}":\n\n'
        + "\n\n".join(snippets)
        + "\n\nThis answer is assembled from retrieved document chunks, so treat it as grounded context rather than a free-form model completion."
    )

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
    response = {
        "query": request.query,
        "model": request.model,
        "results": results,
    }
    if request.model == "contextual-rag":
        response["answer"] = build_contextual_answer(request.query, results)
    return response


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@app.delete("/documents/{source_name:path}")
def delete_document(source_name: str):
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        return {
            "deleted_rows": 0,
            "source": source_name,
            "warning": "DATABASE_URL not set; no pgvector rows were removed",
        }

    deleted_rows = vector.delete_document_embeddings(db_url, source_name)
    return {"deleted_rows": deleted_rows, "source": source_name}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", response_class=PlainTextResponse)
def something() -> str:
    return "hello world"

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8081"))
    uvicorn.run(app, host="0.0.0.0", port=port)

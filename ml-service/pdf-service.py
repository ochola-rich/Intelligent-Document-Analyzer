from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
from processor import pdf_to_markdown_chunks
import vector

app = FastAPI()

@app.post("/upload")
async def upload_pdf(request: Request):
    with open("/tmp/file.pdf", "wb") as f:
        async for chunk in request.stream():
            f.write(chunk)
    processed_pages = pdf_to_markdown_chunks("/tmp/file.pdf")
    embeddings, data_chunks = vector.generate_bge_embeddings(processed_pages)
    print(f"Generated {len(embeddings)} embeddings for {len(data_chunks)} chunks")
    inserted_rows = vector.save_embeddings_to_pgvector(embeddings, data_chunks)
    print(f"Inserted {inserted_rows} rows into pgvector")
    return {"status": "saved", "pages": len(processed_pages)}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", response_class=PlainTextResponse)
def something() -> str:
    return "hello world"

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8081)

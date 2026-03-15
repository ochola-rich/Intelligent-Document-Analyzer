from fastapi import FastAPI
from fastapi.responses import PlainTextResponse

app = FastAPI()


@app.post("/pdf-service/Upload", response_class=PlainTextResponse)
def upload_pdf() -> str:
    return "Hello World!"


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)

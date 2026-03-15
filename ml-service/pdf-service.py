from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse

app = FastAPI()

@app.post("/upload")
async def upload_pdf(request: Request):
    contents = await request.body()
    print(len(contents))
    return {"status": "received"}
    
@app.get("/", response_class=PlainTextResponse)
def something()-> str:
    return "hello world"

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8081)

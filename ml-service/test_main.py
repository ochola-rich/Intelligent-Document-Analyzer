from fastapi.testclient import TestClient

from main import app


def test_upload_pdf_returns_hello_world():
    client = TestClient(app)
    response = client.post("/pdf-service/Upload")

    assert response.status_code == 200
    assert response.text == "Hello World!"


def test_health_returns_ok():
    client = TestClient(app)
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_extract_returns_text_payload():
    client = TestClient(app)
    files = {"file": ("sample.txt", b"Hello from OCR", "text/plain")}

    response = client.post("/extract", files=files)

    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "Hello from OCR"
    assert body["source"] == "sample.txt"

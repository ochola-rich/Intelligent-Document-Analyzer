import importlib
from fastapi.testclient import TestClient

pdf_service = importlib.import_module("pdf-service")
app = pdf_service.app


def test_root_returns_hello_world():
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert response.text == "hello world"


def test_health_returns_ok():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

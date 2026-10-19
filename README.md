# Intelligent Document Analyzer

A polyglot microservices system demonstrating distributed document ingestion, asynchronous job coordination, and vector-based semantic retrieval using **Go**, **Python**, **PostgreSQL (pgvector)**, and **React**.

[![CI](https://github.com/ochola-rich/Intelligent-Document-Analyzer/actions/workflows/ci.yml/badge.svg)](https://github.com/ochola-rich/Intelligent-Document-Analyzer/actions/workflows/ci.yml)
[![Go](https://img.shields.io/badge/Go-1.24%2B-00ADD8?logo=go&logoColor=white)](https://go.dev/)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![pgvector](https://img.shields.io/badge/PostgreSQL-pgvector-336791?logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

---

## Architecture Overview

The system splits responsibilities across distinct microservices to balance concurrent I/O throughput with compute-heavy vector embeddings:

```
[ Frontend (React / Vite) ]
          │  HTTP / REST
          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Go API Gateway (:8080)                    │
│  - Multipart upload staging & MIME type detection           │
│  - Document state tracking & asynchronous job polling       │
│  - Reverse proxy for document management & search           │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               │ HTTP (:8081)                 │ JDBC (:8082)
               ▼                              ▼
┌───────────────────────────────┐  ┌───────────────────────────┐
│     Python ML Service         │  │   Java Analytics Service  │
│  - PyMuPDF text extraction    │  │   (Spring Boot)           │
│  - all-MiniLM-L6-v2 embeddings│  │  - Metadata management    │
│  - Background ProcessPool     │  │  - Analytics endpoints    │
│  - Semantic search & RAG      │  └─────────────┬─────────────┘
└──────────────┬────────────────┘                │
               │ SQL <=>                         │
               ▼                                 │
┌────────────────────────────────────────────────┴────────────┐
│              PostgreSQL 16 + pgvector (:5432)               │
│  - Document chunks with 384-dimensional dense vectors       │
│  - Cosine distance index for sub-linear similarity search   │
└─────────────────────────────────────────────────────────────┘
```

---

## Repository Structure

```
.
├── Api-Gateway/          # Go API Gateway (HTTP routing, upload staging, job polling)
├── ml-service/           # Python FastAPI service (text chunking, embeddings, pgvector)
├── filesanalyzer/        # Java Spring Boot service (document analytics & metadata)
├── frontend/             # React / Vite web dashboard
├── db/                   # Database schemas (PostgreSQL + pgvector init script)
├── docker-compose.yml    # Complete multi-service orchestration
└── .github/workflows/    # Automated CI for Go and Python test suites
```

---

## Current Status: What Works vs. What's Planned

### What Works Today
- **Go API Gateway**: Multipart file upload staging, content-type sniffing, status tracking, retry handlers, document deletion, and asynchronous background polling of processing jobs.
- **Python ML Pipeline**: Fast PDF text extraction and chunking (PyMuPDF), 384-dimensional dense embedding generation (`sentence-transformers/all-MiniLM-L6-v2`), and asynchronous job queue via `ProcessPoolExecutor`.
- **Vector Storage & Semantic Search**: Storage of document embeddings in PostgreSQL using `pgvector`, query embedding generation, and cosine distance search (`<=>`) with similarity thresholds.
- **Contextual Answer Assembly**: Retrieval-augmented chunk synthesis assembling grounded answers directly from matched passages.
- **Containerized Orchestration**: Automated local environment with dependency health checks in `docker-compose.yml`.
- **Automated Testing & CI**: Unit and integration test suites running on GitHub Actions.

### Planned Enhancements
- [ ] **OCR Engine**: Tesseract OCR fallback pipeline for scanned or non-text PDFs.
- [ ] **External LLM Integration**: Pluggable inference layer (Ollama / vLLM / OpenAI API) for generative summarization on top of retrieved chunks.
- [ ] **Object Storage**: S3 / MinIO driver replacing local staging volumes for distributed deployments.

---

## Quickstart (Docker Compose)

### Prerequisites
- Docker and Docker Compose (v2.0+)

### Start the System

1. Clone the repository:
   ```bash
   git clone https://github.com/ochola-rich/Intelligent-Document-Analyzer.git
   cd Intelligent-Document-Analyzer
   ```

2. Spin up all services with health checks:
   ```bash
   docker-compose up --build
   ```

3. Verify service endpoints:
   - **Frontend UI**: [http://localhost:5173](http://localhost:5173)
   - **Go API Gateway**: [http://localhost:8080/health](http://localhost:8080/health)
   - **Python ML Service**: [http://localhost:8081/health](http://localhost:8081/health)
   - **Java Analytics Service**: [http://localhost:8082/health](http://localhost:8082/health)

---

## API Reference & Usage

### 1. Ingest a Document
Upload a PDF via the Go Gateway:
```bash
curl -X POST http://localhost:8080/upload \
  -F "file=@sample.pdf"
```
**Response (201 Created):**
```json
{
  "id": "4a7f0e32b...",
  "status": "queued",
  "filename": "sample.pdf",
  "created_at": "2026-10-19T08:00:00Z"
}
```

### 2. Semantic Search over Ingested Documents
Search by meaning across stored vector embeddings:
```bash
curl -X POST http://localhost:8080/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "financial risk mitigation strategies",
    "limit": 3,
    "min_similarity": 0.3,
    "model": "contextual-rag"
  }'
```

### 3. Check System Health
```bash
curl http://localhost:8080/health
```

---

## Running Tests Locally

### Go API Gateway Tests
```bash
cd Api-Gateway
go test -v ./...
```

### Python ML Service Tests
```bash
cd ml-service
pytest -v test_main.py
```

---

## License

This project is licensed under the MIT License.

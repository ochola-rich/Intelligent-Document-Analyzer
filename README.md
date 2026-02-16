# Intelligent Document Analyzer

Polyglot Microservices Architecture for Document Processing and RAG Foundations

---

## Overview

Intelligent Document Analyzer is a full-stack, polyglot microservices system designed for real-world document ingestion, text extraction, and AI-driven document understanding. The platform integrates Go, Java, and Python services to demonstrate scalable backend engineering, clean service boundaries, and strong foundations for machine learning pipelines and Retrieval-Augmented Generation (RAG).

This repository provides a production-ready structure for:

* Document upload and ingestion workflows
* OCR and text preprocessing
* Embedding generation and vector search
* Service-to-service communication
* RAG pipeline foundations
* Full-stack integration with a frontend dashboard

The project is suitable as a portfolio highlight or a base for building enterprise document intelligence solutions.

---

## Architecture Summary

The system is composed of multiple independently deployable microservices:

### Go Service (API Gateway / Ingestion Layer)

* Receives document uploads
* Routes traffic to backend services
* Coordinates OCR and ML pipelines
* Designed for high performance and concurrency

### Java Service (Document Analytics and Metadata Management)

* Manages document metadata, statuses, and event logs
* Provides analytics endpoints
* Built with Spring Boot for enterprise-grade reliability

### Python Service (ML Processing and RAG Core)

* Performs OCR, text extraction, and preprocessing
* Generates embeddings for vector search
* Organizes the foundation for question answering and RAG workflows
* Built on FastAPI for clean, efficient ML service deployment

### Frontend (React)

* Provides a user interface for uploading, viewing, and interacting with documents
* Serves as the primary client for the Go API gateway

### Supporting Systems

* PostgreSQL for metadata and analytics
* ChromaDB (or other vector store) for embeddings
* MinIO or S3-compatible storage for raw document files
* Docker Compose for orchestrating services locally

---

## Key Features

* Polyglot microservices using Go, Java, and Python
* Clean architecture with well-defined service boundaries
* Document upload workflows and status tracking
* OCR and text extraction pipeline
* Vector-based retrieval architecture for RAG
* Containerized deployment ready for local or cloud environments
* Scalable foundation for advanced ML and LLM-based features

---

## Repository Structure

```
intelligent-document-analyzer/
├── README.md
├── docker-compose.yml
├── docs/
│   ├── architecture.png
│   ├── rag-flow.md
│   └── service-overview.md
├── services/
│   ├── gateway-go/
│   ├── analytics-java/
│   ├── ml-python/
├── frontend/
├── db/
└── vector-db/
```

Each service contains its own Dockerfile, internal folder structure, and service-specific README.

---

## Getting Started

### Prerequisites

* Docker and Docker Compose
* Git
* Optional: Go, Java (JDK 17+), Python 3.10+, Node.js (for direct development)

### Running the System

Build and start all services:

```
docker-compose up --build
```

Access services:

* Go Gateway: [http://localhost:8080/health](http://localhost:8080/health)
* Java Analytics: [http://localhost:8081/health](http://localhost:8081/health)
* Python ML: [http://localhost:8082/health](http://localhost:8082/health)
* Frontend: [http://localhost:5173](http://localhost:5173)

---

## Development Workflow

1. Modify or extend any microservice independently
2. Add new endpoints or pipelines as needed
3. Rebuild the affected service
4. Test interactions via the gateway or frontend

The structure supports agile iteration and modular scaling.

---

## Roadmap

### Phase 1: Core System

* Implement document upload handling
* Persist metadata via Java analytics service
* Add MinIO for file storage handling

### Phase 2: OCR and Text Extraction

* Implement OCR using Python/Tesseract
* Normalize and clean extracted text
* Start basic pipeline integration between services

### Phase 3: Embeddings and Vector Search

* Implement chunking and embedding generation
* Store vectors in ChromaDB
* Build semantic search endpoints

### Phase 4: RAG Integration

* Create LLM-based answer generation using retrieved chunks
* Implement “Ask this document” and “Search across library”
* Add context window management and answer validation

### Phase 5: Frontend Enhancements

* Document list and detail views
* Semantic search UI
* Document Q&A interface
* Analytics dashboards

---

## Purpose and Use Cases

This project is intended for:

* Demonstrating backend engineering across multiple languages
* Practicing ML pipelines and vector retrieval
* Building foundations for enterprise-grade document intelligence systems
* Showcasing modern microservice architecture in a portfolio
* Extending toward fully functional RAG-based document question answering systems

It serves as a strong template for real-world AI infrastructure used in finance, legal, logistics, and enterprise automation.

---

## License

This project is released under the MIT License. You may use, modify, and distribute it freely.


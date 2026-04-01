FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DEFAULT_TIMEOUT=300 \
    HF_HOME=/app/.cache/huggingface

ARG EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
ENV EMBEDDING_MODEL=${EMBEDDING_MODEL}

WORKDIR /app

COPY pdf-service.py processor.py vector.py search.py ./

RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch

RUN pip install --no-cache-dir \
    fastapi \
    uvicorn \
    sentence-transformers \
    pymupdf \
    pgvector \
    "psycopg[binary]" \
    python-multipart

RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${EMBEDDING_MODEL}')"

EXPOSE 8081

CMD ["python", "pdf-service.py"]

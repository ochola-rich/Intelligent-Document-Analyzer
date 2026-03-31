FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pdf-service.py processor.py vector.py ./

RUN pip install --no-cache-dir \
    fastapi \
    uvicorn \
    sentence-transformers \
    pymupdf \
    pgvector \
    "psycopg[binary]"

EXPOSE 8081

CMD ["python", "pdf-service.py"]

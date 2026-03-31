#!/usr/bin/env bash

set -euo pipefail

compose_cmd=""
if command -v docker-compose >/dev/null 2>&1; then
  compose_cmd="docker-compose"
elif command -v docker >/dev/null 2>&1; then
  compose_cmd="docker compose"
else
  echo "Docker Compose not found (docker-compose or docker compose)." >&2
  exit 1
fi

echo "Starting services with Docker Compose..."
${compose_cmd} up -d --build

echo "Ensuring pgvector extension exists..."
${compose_cmd} exec -T postgres psql -U blaq -d filesanalyzer_db -c "CREATE EXTENSION IF NOT EXISTS vector;"

echo "Stack is up and pgvector is ready."

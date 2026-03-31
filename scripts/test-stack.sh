#!/usr/bin/env bash

set -euo pipefail

gateway_url="${GATEWAY_URL:-http://localhost:8080}"
ml_url="${ML_URL:-http://localhost:8081}"
java_url="${JAVA_URL:-http://localhost:8082}"
sample_pdf="${SAMPLE_PDF:-testdata/sample.pdf}"

wait_for_http() {
  local name="$1"
  local url="$2"
  local attempts="${3:-30}"

  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "$url" >/dev/null; then
      echo "$name is ready at $url"
      return 0
    fi
    sleep 2
  done

  echo "$name did not become ready at $url" >&2
  return 1
}

wait_for_http "API gateway" "$gateway_url/health"
wait_for_http "ML service" "$ml_url/health"
wait_for_http "Java analytics" "$java_url/health"

if [[ ! -f "$sample_pdf" ]]; then
  echo "Sample PDF not found: $sample_pdf" >&2
  exit 1
fi

echo "Uploading sample document through the gateway..."
upload_response="$(curl -fsS -X POST -F "file=@${sample_pdf};type=application/pdf" "$gateway_url/upload")"
echo "Gateway upload response: $upload_response"

echo "All health checks passed and the upload route responded successfully."

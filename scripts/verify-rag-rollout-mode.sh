#!/bin/bash

set -euo pipefail

if [ $# -ne 3 ]; then
    echo "Usage: $0 <base_url> <jwt> <TOOLS|RAG_SHADOW|RAG_READ|HYBRID>" >&2
    exit 1
fi

base_url="${1%/}"
jwt="$2"
expected_mode="$3"

case "$expected_mode" in
    TOOLS|RAG_SHADOW|RAG_READ|HYBRID) ;;
    *)
        echo "Invalid expected mode: $expected_mode" >&2
        exit 1
        ;;
esac

response_file=$(mktemp)
trap 'rm -f "$response_file"' EXIT

status=$(curl \
    --silent \
    --show-error \
    --output "$response_file" \
    --write-out '%{http_code}' \
    --request POST \
    --header "Authorization: Bearer $jwt" \
    --header 'Content-Type: application/json' \
    --data '{"prompt":"Describime las propiedades autorizadas sin indicar estados, fechas ni montos"}' \
    "$base_url/ai/respond")

if [ "$status" != "201" ]; then
    echo "Unexpected HTTP status: $status" >&2
    exit 1
fi

node - "$response_file" "$expected_mode" <<'NODE'
const fs = require('node:fs');
const [file, expected] = process.argv.slice(2);
const response = JSON.parse(fs.readFileSync(file, 'utf8'));
if (response.retrievalMode !== expected) {
  throw new Error(
    `Expected retrievalMode=${expected}, received ${response.retrievalMode}`,
  );
}
if (typeof response.outputText !== 'string' || response.outputText.length === 0) {
  throw new Error('Response has no outputText');
}
process.stdout.write(
  `${JSON.stringify({
    retrievalMode: response.retrievalMode,
    strategy: response.retrieval?.strategy,
    insufficientEvidence: response.insufficientEvidence,
    sourceCount: response.sources?.length || 0,
  }, null, 2)}\n`,
);
NODE

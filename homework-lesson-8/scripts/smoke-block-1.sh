#!/usr/bin/env bash

set -euo pipefail

echo "[smoke:block:1] Running real tools validation..."

WEB_SEARCH_OUTPUT="$(node --import tsx -e 'import { webSearch } from "./src/tools/web-search.ts"; const out = await webSearch({ query: "naive RAG" }); console.log(out);')"
if ! echo "$WEB_SEARCH_OUTPUT" | grep -q "\"url\""; then
  echo "web_search smoke failed: no URL in normalized output."
  exit 1
fi

READ_URL_OUTPUT="$(node --import tsx -e 'import { readUrl } from "./src/tools/read-url.ts"; const out = await readUrl({ url: "https://en.wikipedia.org/wiki/Retrieval-augmented_generation" }); console.log(out.slice(0, 400));')"
if ! echo "$READ_URL_OUTPUT" | grep -qi "retrieval-augmented generation\\|RAG"; then
  echo "read_url smoke failed: extracted content does not look valid."
  exit 1
fi

WRITE_REPORT_OUTPUT="$(node --import tsx -e 'import { writeReport } from "./src/tools/write-report.ts"; const out = await writeReport({ filename: "smoke_block_1.md", content: "# Smoke Block 1\n\nreal tools check" }); console.log(out);')"
if ! echo "$WRITE_REPORT_OUTPUT" | grep -q "Report saved to output/smoke_block_1.md"; then
  echo "write_report smoke failed: unexpected save output."
  exit 1
fi

if [[ ! -f "output/smoke_block_1.md" ]]; then
  echo "write_report smoke failed: output/smoke_block_1.md does not exist."
  exit 1
fi

echo "[smoke:block:1] Passed."

#!/usr/bin/env bash

set -euo pipefail

echo "[smoke:block:2] Running LangChain tools smoke cases..."

node --import tsx -e '
import { langchainTools } from "./src/tools/langchain-tools.ts";

const names = langchainTools.map((tool) => tool.name).sort();
const expected = [
  "github_get_file_content",
  "github_list_directory",
  "read_url",
  "web_search",
  "write_report",
].sort();

if (JSON.stringify(names) !== JSON.stringify(expected)) {
  throw new Error(`unexpected tool registry: ${JSON.stringify(names)}`);
}
'

echo "[smoke:block:2] Static LangChain tools checks passed."

echo "[smoke:block:2] Running optional live agent smoke..."
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  OUTPUT="$(printf 'Reply with one short sentence about RAG.\nn\nquit\n' | npm run dev 2>&1)"
  if ! echo "$OUTPUT" | grep -q "Agent:"; then
    echo "Live agent smoke failed: missing agent output."
    echo "$OUTPUT"
    exit 1
  fi
  echo "[smoke:block:2] Live agent smoke passed."
else
  echo "[smoke:block:2] Skipped live agent smoke: OPENAI_API_KEY is not set."
fi

echo "[smoke:block:2] Passed."

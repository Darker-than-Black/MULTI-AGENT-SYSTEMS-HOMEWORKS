#!/usr/bin/env bash

set -euo pipefail

for block in 0 1 2 3 4 5 6; do
  echo ""
  echo "========== Running block ${block} =========="
  bash scripts/run-block-validation.sh "$block"
done

echo ""
echo "All block validations passed."

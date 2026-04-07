#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(git -C "$PROJECT_DIR" rev-parse --show-toplevel)"
cd "$REPO_ROOT"

chmod +x .githooks/pre-commit
chmod +x .githooks/pre-push
find "$PROJECT_DIR/scripts" -maxdepth 1 -type f -name "*.sh" -exec chmod +x {} +

git config core.hooksPath .githooks

echo "Git hooks installed. core.hooksPath is set to .githooks"

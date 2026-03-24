#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

chmod +x .githooks/pre-commit
chmod +x .githooks/pre-push
chmod +x homework-lesson-5/scripts/check-architecture-sync.sh
chmod +x homework-lesson-5/scripts/check-architecture-invariants.sh
chmod +x homework-lesson-5/scripts/run-block-validation.sh
chmod +x homework-lesson-5/scripts/run-all-block-validations.sh
chmod +x homework-lesson-5/scripts/smoke-block-0.sh
chmod +x homework-lesson-5/scripts/smoke-block-1.sh
chmod +x homework-lesson-5/scripts/smoke-block-2.sh
chmod +x homework-lesson-5/scripts/smoke-block-3.sh
chmod +x homework-lesson-5/scripts/smoke-block-4.sh
chmod +x homework-lesson-5/scripts/smoke-block-5.sh
chmod +x homework-lesson-5/scripts/smoke-block-6.sh
chmod +x homework-lesson-5/scripts/smoke-block-placeholder.sh

git config core.hooksPath .githooks

echo "Git hooks installed. core.hooksPath is set to .githooks"

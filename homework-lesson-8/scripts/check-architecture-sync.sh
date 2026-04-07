#!/usr/bin/env bash

set -euo pipefail

MODE="${1:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(git -C "$PROJECT_DIR" rev-parse --show-toplevel)"
PROJECT_REL="${PROJECT_DIR#${REPO_ROOT}/}"
cd "$REPO_ROOT"

ARCH_FILE="${PROJECT_REL}/docs/ARCHITECTURE.md"
TYPE_CONTRACT_FILE="${PROJECT_REL}/src/agent/types.ts"
MODULE_BOUNDARY_PATTERN="^${PROJECT_REL}/src/(agent|tools|config|utils|rag)/"

if [[ ! -f "$ARCH_FILE" ]]; then
  echo "Architecture check failed: missing $ARCH_FILE"
  exit 1
fi

collect_changed_files() {
  if [[ "$MODE" == "--staged" ]]; then
    git diff --cached --name-only
    return
  fi

  if [[ "$MODE" == "--upstream" ]]; then
    if git rev-parse --verify --quiet "@{upstream}" >/dev/null; then
      git diff --name-only "@{upstream}...HEAD"
      return
    fi

    if git rev-parse --verify --quiet "HEAD~1" >/dev/null; then
      git diff --name-only "HEAD~1...HEAD"
      return
    fi

    git diff --name-only HEAD
    return
  fi

  echo "Usage: $0 [--staged|--upstream]"
  exit 2
}

CHANGED_FILES="$(collect_changed_files)"

if [[ -z "$CHANGED_FILES" ]]; then
  exit 0
fi

requires_arch_update=0
arch_updated=0

if echo "$CHANGED_FILES" | grep -Eq "^${TYPE_CONTRACT_FILE}$"; then
  requires_arch_update=1
fi

if echo "$CHANGED_FILES" | grep -Eq "$MODULE_BOUNDARY_PATTERN"; then
  requires_arch_update=1
fi

if echo "$CHANGED_FILES" | grep -Eq "^${ARCH_FILE}$"; then
  arch_updated=1
fi

if [[ "$requires_arch_update" -eq 1 && "$arch_updated" -eq 0 ]]; then
  echo "Architecture contract check failed."
  echo "Detected changes in module boundaries or type contracts without updating ${ARCH_FILE}."
  echo "Please update ${ARCH_FILE} in the same commit."
  exit 1
fi

exit 0

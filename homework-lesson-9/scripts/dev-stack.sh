#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_DIR"

SEARCH_MCP_LOG="$(mktemp)"
GITHUB_MCP_LOG="$(mktemp)"
REPORT_MCP_LOG="$(mktemp)"
ACP_LOG="$(mktemp)"

echo "[dev:stack] Starting SearchMCP..."
npm run mcp:search >"$SEARCH_MCP_LOG" 2>&1 &
SEARCH_MCP_PID=$!

echo "[dev:stack] Starting GitHubMCP..."
npm run mcp:github >"$GITHUB_MCP_LOG" 2>&1 &
GITHUB_MCP_PID=$!

echo "[dev:stack] Starting ReportMCP..."
npm run mcp:report >"$REPORT_MCP_LOG" 2>&1 &
REPORT_MCP_PID=$!

echo "[dev:stack] Starting ACP server..."
npm run acp:server >"$ACP_LOG" 2>&1 &
ACP_PID=$!

cleanup() {
  for pid in "${ACP_PID:-}" "${REPORT_MCP_PID:-}" "${GITHUB_MCP_PID:-}" "${SEARCH_MCP_PID:-}"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
}

trap cleanup EXIT INT TERM

sleep 2

echo "[dev:stack] All protocol servers were started."
echo "[dev:stack] ACP log: $ACP_LOG"
echo "[dev:stack] SearchMCP log: $SEARCH_MCP_LOG"
echo "[dev:stack] GitHubMCP log: $GITHUB_MCP_LOG"
echo "[dev:stack] ReportMCP log: $REPORT_MCP_LOG"
echo "[dev:stack] Launching CLI..."

npm run dev

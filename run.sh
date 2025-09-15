#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Ensure pnpm is available
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Attempting to activate via corepack..." >&2
  if command -v corepack >/dev/null 2>&1; then
    corepack enable || true
    corepack prepare pnpm@latest --activate || true
  fi
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Error: pnpm is required. Install with 'npm i -g pnpm' or 'brew install pnpm'." >&2
  exit 1
fi

# Install deps if vite is missing or node_modules does not exist
if [ ! -d node_modules ] || [ ! -x node_modules/.bin/vite ]; then
  echo "Installing dependencies..." >&2
  pnpm install
fi

echo "Starting dev server..." >&2
pnpm dev

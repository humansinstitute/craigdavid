#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Install deps if missing
if [ ! -d node_modules ]; then
  pnpm install
fi

pnpm dev

#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

(cd "$ROOT" && npm test && npm start -- --help >/dev/null)
(cd "$ROOT/demo-web" && npm test)

while IFS= read -r file; do node --check "$file"; done < <(find "$ROOT" -name '*.js' -type f -not -path '*/node_modules/*' -print)
python scripts/syntax-checks.py "$ROOT"
python scripts/scan-secrets.py "$ROOT"

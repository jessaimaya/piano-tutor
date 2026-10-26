#!/usr/bin/env bash
# Process everything in ./inbox: check, rate, stage and register new scores (see inbox/README.md).
#   ./ingest.sh            report only
#   ./ingest.sh --apply    add to app/scores/library.json, run the tests, move files to inbox/done or inbox/held
# Extra flags go to tools/import-scores.py (e.g. --stage 3, --source "musescore.com", --accept-unknown).
set -euo pipefail
cd "$(dirname "$0")"
python3 -I tools/import-scores.py --inbox "$@"
case " $* " in
  *" --apply "*) (cd app && npx vitest run 2>&1 | grep -E 'Tests|FAIL|failed') ;;
esac

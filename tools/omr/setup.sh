#!/usr/bin/env bash
# One-time setup: a Python 3.12 environment with homr (and the MCP library), plus homr's models (about 100 MB, downloaded from
# homr's own release). Needs `uv` and `pdftoppm` (poppler). The system Python is not used: homr's dependencies lag behind new releases.
set -euo pipefail
cd "$(dirname "$0")"
command -v uv >/dev/null || { echo "uv is required: https://docs.astral.sh/uv/"; exit 1; }
command -v pdftoppm >/dev/null || { echo "pdftoppm is required (poppler-utils)"; exit 1; }
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
PYTHONWARNINGS=ignore .venv/bin/homr --init
echo "Ready. Try: .venv/bin/python pdf2xml.py --help"

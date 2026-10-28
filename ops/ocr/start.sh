#!/usr/bin/env bash
set -euo pipefail
# Install these dependencies in a dedicated Python 3.11 venv on the Linux host.
# Official basic serving API: POST /ocr, image bytes supplied as base64.
exec paddlex --serve --pipeline OCR --device cpu --host 127.0.0.1 --port "${PERIPLUS_OCR_PORT:-8106}"

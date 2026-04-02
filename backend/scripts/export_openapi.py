#!/usr/bin/env python3
"""Write OpenAPI 3 JSON for static docs / Swagger UI import (no server required)."""

import json
import sys
from pathlib import Path

# Run from repo root: python backend/scripts/export_openapi.py
# Or from backend: python scripts/export_openapi.py
_backend = Path(__file__).resolve().parent.parent
if str(_backend) not in sys.path:
    sys.path.insert(0, str(_backend))

from main import app  # noqa: E402


def main():
    root = _backend.parent
    out = root / "docs" / "openapi.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    spec = app.openapi()
    out.write_text(json.dumps(spec, indent=2), encoding="utf-8")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()

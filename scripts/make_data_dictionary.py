"""Render backend/data/data_dictionary.json to docs/DATA_DICTIONARY.md."""
import json
from pathlib import Path
root = Path(__file__).resolve().parent.parent
d = json.loads((root / "backend/data/data_dictionary.json").read_text())
out = ["# PRISM data dictionary", "", "Generated from `backend/data/data_dictionary.json` (single source of truth; schema in `backend/schema.py`).", ""]
for t, rows in d["tables"].items():
    out += [f"## {t}", "", "| Field | Type | Description |", "|---|---|---|"]
    for r in rows:
        out.append(f"| `{r['field']}` | {r['type']}{' — ' + r['values'] if r.get('values') else ''} | {r['description']} |")
    out.append("")
(root / "docs/DATA_DICTIONARY.md").write_text("\n".join(out))
print("wrote docs/DATA_DICTIONARY.md")

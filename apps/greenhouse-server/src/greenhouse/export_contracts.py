"""Export schemas without starting a server or initializing simulation dependencies."""

import argparse
import json
from pathlib import Path

from greenhouse.api.contracts import HttpModels, client_adapter, server_adapter
from greenhouse.api.main import app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    output = Path(__file__).resolve().parents[2] / "contracts"
    output.mkdir(exist_ok=True)
    schemas = {
        "openapi.json": app.openapi(),
        "http-models.schema.json": HttpModels.model_json_schema(),
        "websocket-client.schema.json": client_adapter.json_schema(),
        "websocket-server.schema.json": server_adapter.json_schema(),
    }
    for filename, schema in schemas.items():
        path = output / filename
        text = json.dumps(schema, indent=2, sort_keys=True) + "\n"
        if args.check:
            if not path.exists() or path.read_text() != text:
                raise SystemExit(f"{filename} is stale. Run pnpm contracts:greenhouse.")
        else:
            path.write_text(text)
    print("Python contracts match." if args.check else "Exported HTTP and WebSocket schemas.")


if __name__ == "__main__":
    main()

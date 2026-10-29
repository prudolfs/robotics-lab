import hashlib
import os
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel


def atomic_model(path: Path, model: BaseModel) -> None:
    atomic_bytes(path, model.model_dump_json().encode())


def atomic_bytes(path: Path, payload: bytes) -> None:
    temporary = path.with_name(f".{uuid4().hex}.tmp")
    try:
        temporary.write_bytes(payload)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

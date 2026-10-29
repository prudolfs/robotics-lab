import pytest


@pytest.fixture(autouse=True)
def isolated_artifact_roots(tmp_path, monkeypatch):
    """Tests must never inspect or interrupt the user's persisted training jobs."""
    monkeypatch.setenv("GREENHOUSE_DATASET_DIR", str(tmp_path / "datasets-default"))
    monkeypatch.setenv("GREENHOUSE_TRAINING_DIR", str(tmp_path / "training-default"))
    monkeypatch.setenv("GREENHOUSE_MISSION_DIR", str(tmp_path / "missions-default"))
    monkeypatch.delenv("GREENHOUSE_MISSION_MODEL", raising=False)

from pathlib import Path
import joblib
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from backend.app.main import create_app, FEATURES

ROOT = Path(__file__).resolve().parents[2]
SCENARIO = {"latitud": -12.0, "longitud": -77.0, "profundidad_km": 30.0, "magnitud": 5.0}

@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as value:
        yield value

def test_prediction_matches_original_artifact(client):
    artifact = joblib.load(ROOT / "models" / "clasificador_impacto.pkl")
    row = pd.DataFrame([[SCENARIO[k] for k in FEATURES]], columns=FEATURES)
    expected = int(artifact["modelo"].predict(row)[0])
    response = client.post("/api/v1/predictions", json=SCENARIO)
    assert response.status_code == 200
    payload = response.json()
    assert payload["nivel_impacto"] == artifact["clases"][expected]
    probabilities = artifact["modelo"].predict_proba(row)[0]
    for index, value in zip(artifact["modelo"].classes_, probabilities):
        assert payload["probabilidades"][artifact["clases"][int(index)]] == pytest.approx(float(value))
    assert sum(payload["probabilidades"].values()) == pytest.approx(1, abs=1e-5)
    assert payload["estado_validacion"] == "experimental"
    assert len(payload["version_modelo"]) == 64

@pytest.mark.parametrize("changes", [{"magnitud": 11}, {"profundidad_km": -1}, {"latitud": 91}, {"longitud": -181}, {"extra": 1}, {"magnitud": "NaN"}])
def test_invalid_input(client, changes):
    assert client.post("/api/v1/predictions", json=SCENARIO | changes).status_code == 422

def test_missing_model_disables_predictions(tmp_path):
    with TestClient(create_app(tmp_path / "missing.pkl")) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/ready").status_code == 503
        assert client.post("/api/v1/predictions", json=SCENARIO).status_code == 503

def test_cors_rejects_unlisted_origin(client):
    response = client.options("/api/v1/predictions", headers={"Origin": "https://unknown.example", "Access-Control-Request-Method": "POST"})
    assert response.status_code == 400

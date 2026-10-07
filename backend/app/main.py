"""API experimental. Ejecutar desde la raíz del repositorio."""
from contextlib import asynccontextmanager
from hashlib import sha256
import logging
import os
from pathlib import Path
from threading import Lock

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

ROOT = Path(__file__).resolve().parents[2]
FEATURES = ["latitud", "longitud", "profundidad_km", "magnitud"]
logger = logging.getLogger(__name__)

class Scenario(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    latitud: float = Field(ge=-90, le=90)
    longitud: float = Field(ge=-180, le=180)
    profundidad_km: float = Field(ge=0, le=1000)
    magnitud: float = Field(ge=0, le=10)

class Prediction(BaseModel):
    nivel_impacto: str
    probabilidades: dict[str, float]
    nombre_modelo: str
    version_modelo: str
    estado_validacion: str = "experimental"
    advertencias: list[str]

def create_app(model_path: Path | None = None) -> FastAPI:
    path = model_path or Path(os.getenv("MODEL_PATH", str(ROOT / "models" / "clasificador_impacto.pkl")))

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.artifact = None
        app.state.predict_lock = Lock()
        try:
            # Solamente artefactos locales del equipo; nunca archivos subidos por usuarios.
            artifact = joblib.load(path)
            if artifact["features"] != FEATURES:
                raise ValueError("Las variables del artefacto no coinciden con el contrato")
            if len(artifact["clases"]) != 3:
                raise ValueError("Se esperaban tres clases")
            model = artifact["modelo"]
            if hasattr(model, "set_params"):
                model.set_params(n_jobs=1)
            model.predict(pd.DataFrame([[-12.0, -77.0, 30.0, 5.0]], columns=FEATURES))
            app.state.version = sha256(path.read_bytes()).hexdigest()
            app.state.artifact = artifact
        except Exception:
            logger.exception("No se pudo preparar el clasificador")
        yield
        app.state.artifact = None

    app = FastAPI(title="Evaluación sísmica UNMSM", version="0.1.0", lifespan=lifespan)
    origins = [s.strip() for s in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if s.strip()]
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @app.get("/health")
    def health():
        return {"status": "ok", "api_version": "0.1.0"}

    @app.get("/ready")
    def ready():
        if getattr(app.state, "artifact", None) is None:
            raise HTTPException(503, "El clasificador no está disponible")
        return {"status": "ready", "nombre_modelo": app.state.artifact["nombre_modelo"], "version_modelo": app.state.version, "estado_validacion": "experimental"}

    @app.post("/api/v1/predictions", response_model=Prediction)
    def predict(scenario: Scenario):
        artifact = getattr(app.state, "artifact", None)
        if artifact is None:
            raise HTTPException(503, "El clasificador no está disponible")
        row = pd.DataFrame([[getattr(scenario, key) for key in FEATURES]], columns=FEATURES)
        try:
            with app.state.predict_lock:
                label = int(artifact["modelo"].predict(row)[0])
                values = artifact["modelo"].predict_proba(row)[0]
            classes = artifact["clases"]
            model_classes = artifact["modelo"].classes_
            if label not in range(len(classes)) or len(values) != len(classes):
                raise ValueError("Salida incompatible")
            probabilities = {classes[int(index)]: float(value) for index, value in zip(model_classes, values)}
            if not np.isfinite(list(probabilities.values())).all():
                raise ValueError("Probabilidades no finitas")
            return Prediction(nivel_impacto=classes[label], probabilidades=probabilities, nombre_modelo=artifact["nombre_modelo"], version_modelo=app.state.version, advertencias=[
                "Modelo entrenado con el catálogo anterior: la auditoría del atlas corrigió fechas y cambió etiquetas. Requiere reentrenamiento y evaluación independiente.",
                "Probabilidades sin calibración verificada; no representan certeza.",
                "No estima intensidad por ciudad, daños estructurales ni alerta oficial de tsunami.",
                "Los límites de entrada son físicos; no certifican cobertura del entrenamiento.",
            ])
        except Exception as error:
            logger.exception("Fallo de inferencia")
            raise HTTPException(503, "No se pudo evaluar el escenario") from error

    return app

app = create_app()


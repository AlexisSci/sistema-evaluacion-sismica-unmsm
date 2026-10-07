# Arquitectura y ejecución local

Frontend React + TypeScript + Vite en Cloudflare Pages; API FastAPI + Docker en Render Free. El catálogo y los agrupamientos se sirven como archivos estáticos versionados independientes de la API. MapLibre/OpenFreeMap y ECharts están integrados en el atlas.

## Estado de esta base

Atlas histórico, filtros, reproducción anual, radiografía de zonas, laboratorio con similares, corte de profundidad, capas K-Means/DBSCAN y pasaporte PDF implementados. La auditoría de fechas y asociaciones detectó incompatibilidad con las etiquetas de entrenamiento del XGBoost existente: permanece experimental, pendiente de reentrenamiento y evaluación independiente. No se han desplegado servicios ni comprometido gastos.

## Desarrollo

Desde la raíz, con Python 3.12 y Node 22.12 o superior:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r backend/requirements-dev.txt
.venv\Scripts\python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

En otra terminal:

```powershell
cd frontend
pnpm install --frozen-lockfile
Copy-Item .env.example .env
pnpm dev
```

API: http://127.0.0.1:8000/docs. Frontend: http://127.0.0.1:5173.

Utilizar pnpm 11.19.0 (`corepack prepare pnpm@11.19.0 --activate` si Corepack está disponible). El lockfile se conserva para reproducibilidad.

## Verificaciones

```powershell
.venv\Scripts\python -m pytest backend/tests -q
cd frontend
pnpm build
```

Con Docker instalado, `docker compose up --build` desde la raíz inicia la API. La imagen ejecuta un único worker y limita hilos de cálculo. La prueba de inferencia compara la API con el artefacto original; no mide calidad científica.

## Contrato

- `GET /health`: proceso vivo.
- `GET /ready`: 200 si el modelo está cargado; 503 si falló su preparación.
- `POST /api/v1/predictions`: latitud, longitud, profundidad_km y magnitud. Devuelve clase, probabilidades, nombre y SHA-256 del artefacto, estado experimental y límites.
- 422 para entradas fuera de límites, no finitas o campos adicionales; 503 para inferencia no disponible.

Los límites físicos de entrada no garantizan que el evento esté cubierto por el entrenamiento. Las probabilidades no se presentan como certeza calibrada.

## Despliegue futuro sin gasto inicial

Cloudflare Pages: directorio raíz `frontend`, comando `pnpm install --frozen-lockfile && pnpm build`, salida `dist`. Definir `VITE_API_URL` con la URL HTTPS real de Render antes de compilar. Es configuración pública; no poner secretos en variables VITE.

Render: `render.yaml` declara únicamente una API `plan: free`. Definir `CORS_ORIGINS` con el origen HTTPS exacto del frontend, sin barra final; varios orígenes se separan con coma. Puerto mediante PORT, comprobación `/ready`. No usar comodín de CORS. CORS no es autenticación ni protección frente a abuso; evaluar límites de solicitudes antes de abrir a público amplio.

Mantener planes gratuitos, subdominios y sin ampliaciones automáticas. API sujeta a reactivación y cuotas; mapa y gráficos deberán funcionar aparte. No crear PostgreSQL gratuito de Render para persistencia duradera. Medir RAM, latencia activa/fría y concurrencia antes del despliegue universitario.

## Hitos

1. Semana 1: alcance, roles, arquitectura y riesgos.
2. Semana 2: auditoría de fechas/cruce, EDA y prototipo.
3. Semana 4: métricas, artefactos y prueba temprana Docker/Render.
4. Semana 6: explorador, simulador y agrupamientos públicos.
5. Semana 7: rendimiento y validación independiente.
6. Semana 8: documentación, guía, riesgos y demostración local/nube.


## Problemas frecuentes al arrancar

Son dos procesos: `pnpm dev` inicia solamente la interfaz; FastAPI debe ejecutarse en otra terminal desde la raíz del repositorio. Comprueba http://127.0.0.1:8000/ready antes de evaluar un escenario. Si no responde, inicia `.venv\Scripts\python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000`.

Este frontend usa pnpm y su lockfile. Utiliza `pnpm install --frozen-lockfile` y `pnpm dev`. `npm run dev` puede ejecutar Vite si las dependencias ya están instaladas, pero no inicia la API. No mezcles `npm install` con el árbol de dependencias creado por pnpm: puede fallar con `Unsupported URL Type "workspace:"`. La espera para reactivar Render se aplica al servicio remoto; una API local apagada debe iniciarse manualmente.

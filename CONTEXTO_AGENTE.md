# 🌍 CONTEXTO DEL PROYECTO Y ESTADO ACTUAL (PARA COLABORADORES Y AGENTES IA)

**Proyecto:** Sistema Inteligente de Evaluación de Impacto Sísmico y Detección de Enjambres en el Perú (1960–2026)  
**Institución:** Universidad Nacional Mayor de San Marcos (UNMSM)  
**Estado del Proyecto:** Hay datos y modelos generados; su validez científica sigue pendiente de auditoría. La arquitectura web vigente es React + TypeScript + Vite y FastAPI + Docker. El atlas, la radiografía, el laboratorio con similares, los cortes y los pasaportes PDF están implementados. La exportación validada conserva 25.764 eventos, corrige 9.231 fechas y cambia 646 etiquetas. XGBoost fue entrenado con el catálogo anterior: requiere reevaluación. Consulta docs/ATLAS.md; los conteos y afirmaciones metodológicas del resto de este documento describen el catálogo anterior. Consulta docs/ARQUITECTURA.md para ejecución y despliegue. Las referencias a Streamlit del resto de este documento corresponden al plan anterior.

---

## 1. REGLAS METODOLÓGICAS ESTRICTAS (NO MODIFICAR)

1. **Prohibición de Datos Sintéticos e Imputación Artificial:**
   * El catálogo oficial del IGP (`data/dataset_sismico_maestro.csv`) cuenta con **25,764 eventos sísmicos** (1960–2026).
   * De ellos, **1,119 sismos** poseen intensidad Mercalli empírica real verificada mediante cruce espaciotemporal con la USGS (`catalogo_usgs_peru.csv`).
   * Los 24,645 eventos restantes tienen `intensidad_mercalli` y `nivel_impacto` como `NaN`. **Bajo ningún motivo se deben rellenar con fórmulas teóricas** para evitar *Target Leakage* (fuga de datos).
2. **Separación por Módulos:**
   * **Módulo 1 (Clasificación Supervisada):** Usa exclusivamente los **1,119 casos empíricos reales** y las **4 variables físicas puras del IGP** (`latitud`, `longitud`, `profundidad_km`, `magnitud`), libre de multicolinealidad.
   * **Módulo 2 (Clustering No Supervisado):** Usa los **25,764 sismos completos** para la macro-zonificación tectónica 3D (K-Means) y los **15,717 sismos superficiales ($\le 60\text{ km}$)** para la detección de enjambres sísmicos (DBSCAN con métrica geodésica Haversine).
   * **Evaluación de Tsunami (`alerta_tsunami`):** No es un modelo de Machine Learning (solo hay 16 casos históricos confirmados). Se evalúa mediante una **regla física determinista de la DHN** en la interfaz web: epicentro costero/marino ($\text{Longitud} \le -83.5 - 0.72 \times \text{Latitud}$ y $-19.5 \le \text{Latitud} \le -3.3$), superficial ($\le 60\text{ km}$) y Magnitud $\ge 7.0$.

---

## 2. ESTRUCTURA ACTUAL DEL REPOSITORIO Y ENTREGABLES GENERADOS

```text
sistema-evaluacion-sismica-unmsm/
├── app/
│   └── (Aquí se debe crear app.py para la Fase 4 con Streamlit)
├── data/
│   ├── datos-sismicos_Instrumental_1960-2026.xlsx  # Catálogo original IGP
│   ├── catalogo_usgs_peru.csv                      # Catálogo empírico USGS
│   └── dataset_sismico_maestro.csv                 # Dataset maestro limpio (25,764 filas)
├── models/
│   ├── clasificador_impacto.pkl                    # [LISTO] Modelo ganador XGBoost (Módulo 1)
│   └── modelo_clustering.pkl                       # [LISTO] Modelos K-Means (K=4) + DBSCAN (Módulo 2)
├── notebooks/
│   ├── 01_procesamiento_datos.py                   # [LISTO] Fase 1.1: ETL y cruce IGP-USGS
│   ├── 02_eda_sismico.py                           # [LISTO] Fase 1.2: Análisis Exploratorio (EDA)
│   ├── 03_modelo_clasificacion.py                  # [LISTO] Fase 2: Clasificación (RF vs XGBoost)
│   └── 04_modelo_clustering.py                     # [LISTO] Fase 3: Clustering (K-Means y DBSCAN)
├── reports/
│   └── figures/                                    # [LISTAS] 6 figuras científicas en 300 DPI:
│       ├── 01_distribucion_magnitud_profundidad.png
│       ├── 02_perfil_subduccion_wadati_benioff.png
│       ├── 03_mapa_espacial_y_tsunamis.png
│       ├── 04_impacto_real_usgs_1119.png
│       ├── 05_evaluacion_clasificador_impacto.png
│       └── 06_clustering_zonas_y_enjambres.png
├── CONTEXTO_AGENTE.md
└── requirements.txt
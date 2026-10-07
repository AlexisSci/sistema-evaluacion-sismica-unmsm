# 🌍 Sistema Integral de Evaluación Sísmica mediante Machine Learning

**Universidad Nacional Mayor de San Marcos (UNMSM)**  
*Facultad de Ciencias Matemáticas · Escuela Profesional de Computación Científica*

---

## Versión web actual — TECTA

Cuatro espacios: Explorar, Analizar, Simular y Ciencia. Identidad, navegación y detalles del rediseño en [TECTA](docs/TECTA.md). Atlas histórico, reproducción anual, radiografía de zonas, laboratorio con eventos similares, cortes de profundidad, K-Means/DBSCAN y pasaportes PDF. Consulta [guía del atlas](docs/ATLAS.md) y [ejecución local](docs/ARQUITECTURA.md). La auditoría corrigió 9.231 fechas y cambió 646 etiquetas respecto al catálogo anterior; XGBoost permanece experimental y requiere reevaluación. Los CSV y modelos originales se conservan.

## 📌 Descripción del Proyecto
Plataforma web interactiva desarrollada en **React + TypeScript + Vite** y **FastAPI** para el análisis espacial y la evaluación rápida del impacto de eventos sísmicos en el Perú. El sistema integra el catálogo instrumental del **Instituto Geofísico del Perú (IGP)** (25,764 registros, 1960–2026) enriquecido con variables de impacto del **Servicio Geológico de los Estados Unidos (USGS)** (13,890 registros).

El proyecto se divide en dos módulos principales:
1. **Módulo 1: Simulador de Eventos Sísmicos (Aprendizaje Supervisado):** Clasificación en tiempo real del nivel de sacudida en superficie (Intensidad Mercalli Modificada) y estimación de alerta de tsunami a partir de parámetros hipocentrales (*Latitud, Longitud, Profundidad y Magnitud*).
2. **Módulo 2: Atlas histórico y agrupamientos:** Exploración de eventos por fecha, magnitud y profundidad, radiografía de zonas y capas K-Means/DBSCAN mediante MapLibre/OpenFreeMap. Los grupos de DBSCAN son concentraciones espaciales, pendientes de análisis temporal.

---

## 👥 Equipo de Desarrollo y Roles
Ambos integrantes participan de forma transversal (*Full-Stack Data Science & ML*) en la ingeniería de datos, el entrenamiento de algoritmos y el desarrollo de la aplicación web:

* **Alexis Delgado Pérez** — *Project Manager (PM) & Full-Stack ML Developer*  
  Dirección del proyecto, control de hitos y gestión de riesgos; co-desarrollo del pipeline de preprocesamiento (IGP–USGS), modelado predictivo/espacial, implementación en Streamlit y documentación técnica.
* **Enrique Julca Delgado** — *Full-Stack ML Developer*  
  Co-desarrollo del pipeline de datos y análisis exploratorio (EDA), entrenamiento y validación de algoritmos de Machine Learning, diseño de la interfaz interactiva en Streamlit e integración de componentes.

**Docente / Patrocinador Académico:** Prof. Oscar Benito Pacheco.

---

## 🗂️ Estructura del Repositorio

```text
sistema-evaluacion-sismica-unmsm/
│
├── data/                  # Catálogos sísmicos crudos (IGP / USGS) y dataset maestro limpio
├── notebooks/             # Jupyter Notebooks de EDA, preprocesamiento y experimentación ML
├── models/                # Modelos entrenados y serializados (.joblib / .pkl)
├── app/                   # Código fuente de la interfaz web en Streamlit
│
├── .gitignore             # Exclusión de entornos virtuales y archivos temporales
├── requirements.txt       # Dependencias y librerías del entorno de Python
└── README.md              # Documentación general del proyecto


## Arquitectura web actualizada

La nueva aplicación usa React + TypeScript + Vite y FastAPI + Docker. Cloudflare Pages y Render Free son los destinos de despliegue previstos. La base integra un simulador experimental con el modelo existente; el explorador histórico y la auditoría de datos están pendientes. La descripción inicial de Streamlit queda como antecedente.

Consulta [ejecución local, contratos e hitos](docs/ARQUITECTURA.md).

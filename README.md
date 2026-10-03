# 🌍 Sistema Integral de Evaluación Sísmica mediante Machine Learning

**Universidad Nacional Mayor de San Marcos (UNMSM)**  
*Facultad de Ciencias Matemáticas · Escuela Profesional de Computación Científica*

---

## 📌 Descripción del Proyecto
Plataforma web interactiva desarrollada en **Python** y **Streamlit** para el análisis espacial y la evaluación rápida del impacto de eventos sísmicos en el Perú. El sistema integra el catálogo instrumental del **Instituto Geofísico del Perú (IGP)** (25,764 registros, 1960–2026) enriquecido con variables de impacto del **Servicio Geológico de los Estados Unidos (USGS)** (13,890 registros).

El proyecto se divide en dos módulos principales:
1. **Módulo 1: Simulador de Eventos Sísmicos (Aprendizaje Supervisado):** Clasificación en tiempo real del nivel de sacudida en superficie (Intensidad Mercalli Modificada) y estimación de alerta de tsunami a partir de parámetros hipocentrales (*Latitud, Longitud, Profundidad y Magnitud*).
2. **Módulo 2: Mapa de Zonas Calientes y Enjambres (Aprendizaje No Supervisado):** Detección y visualización interactiva de clústeres espaciales de acumulación de energía sísmica mediante algoritmos de agrupamiento (*K-Means / DBSCAN*) y cartografía en *Folium*.

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

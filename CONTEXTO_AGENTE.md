# 🤖 Guía de Contexto y Reglas de Datos para Agentes de IA y Colaboradores

Este documento detalla qué se ha construido en el proyecto, cómo están estructurados los datos en `data/` y cuáles son las reglas estrictas para continuar con el EDA y el entrenamiento de los modelos.

---

## 1. ¿Qué ya está hecho? (Fase 1.1 Completada)

En `notebooks/01_procesamiento_datos.py` se implementó y ejecutó el pipeline ETL completo:
1. **Carga del catálogo nacional (IGP):** Se procesaron e limpiaron **25,764 sismos** ocurridos en Perú (1960–2026) con variables físicas completas (`latitud`, `longitud`, `profundidad_km`, `magnitud`).
2. **Extracción vía API oficial (USGS):** Se descargaron **13,890 sismos** desde el servicio FDSNWS de EE. UU. (`data/catalogo_usgs_peru.csv`) para obtener mediciones reales de intensidad Mercalli (`mmi_usgs`, `cdi_usgs`) y reportes de tsunami (`tsunami_usgs`).
3. **Cruce temporal y espacial (`merge_asof`):** Se unieron ambos catálogos con una ventana de $\pm 15\text{ segundos}$ y distancia $< 1.5^\circ$, logrando **5,507 coincidencias exactas**.
4. **Limpieza geofísica de etiquetas:**
   - **Intensidad (`intensidad_mercalli` y `nivel_impacto`):** Se conservaron **únicamente los 1,119 registros con medición 100% real de la USGS**. Los demás registros se dejaron como `NaN` a propósito para evitar contaminar el entrenamiento con fórmulas sintéticas (*Target Leakage*).
   - **Tsunamis (`alerta_tsunami`):** Se depuraron los falsos positivos continentales/profundos de la USGS (como sismos en Loreto, Puno o Ayacucho) aplicando la ecuación diagonal de la costa peruana ($\text{Longitud} \le -83.5 - 0.72 \times \text{Latitud}$, $\text{Latitud} \le -3.3^\circ$) y profundidad superficial ($\le 60\text{ km}$), obteniendo **16 eventos tsunamigénicos históricos confirmados**.

---

## 2. ¿Qué archivo de datos se debe usar?

**ÚNICO ARCHIVO DE TRABAJO:** `data/dataset_sismico_maestro.csv`
*(No usar directamente el `.xlsx` del IGP ni `catalogo_usgs_peru.csv`, ya que son respaldos crudos y toda su información limpia ya está consolidada en `dataset_sismico_maestro.csv`).*

### Reglas estrictas de uso de datos según el módulo (¡Leer antes de generar código!):

#### A) Para el Módulo 1: Clasificación Supervisada de Impacto (`nivel_impacto`)
* **Filas a utilizar:** Filtrar **SOLO los 1,119 registros reales** que no tienen `NaN` en `nivel_impacto`:
  ```python
  df_clf = df.dropna(subset=["nivel_impacto"]).copy() # 1,119 filas reales
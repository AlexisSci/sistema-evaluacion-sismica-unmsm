import os
import json
import urllib.request
import pandas as pd
import numpy as np

RUTA_IGP = os.path.join("data", "datos-sismicos_Instrumental_1960-01-01_2026-10-03.xlsx")
RUTA_USGS_CSV = os.path.join("data", "catalogo_usgs_peru.csv")
RUTA_MAESTRO = os.path.join("data", "dataset_sismico_maestro.csv")

print("1. Cargando catálogo oficial del IGP...")
df_igp = pd.read_excel(RUTA_IGP, sheet_name=0)

cols_originales = list(df_igp.columns)
df_igp = df_igp.rename(columns={
    cols_originales[0]: "fecha_utc",
    cols_originales[1]: "hora_utc",
    cols_originales[2]: "latitud",
    cols_originales[3]: "longitud",
    cols_originales[4]: "profundidad_km",
    cols_originales[5]: "magnitud"
})

# Limpiar fecha y hora para conservar los 25,764 registros íntegros
fecha_limpia = pd.to_datetime(df_igp["fecha_utc"], format="mixed", dayfirst=True, errors="coerce").dt.strftime("%Y-%m-%d")
hora_limpia = df_igp["hora_utc"].astype(str).str.strip().str[:8]

df_igp["fecha_hora_utc"] = pd.to_datetime(
    fecha_limpia + " " + hora_limpia, format="mixed", errors="coerce"
).astype("datetime64[ms]")

df_igp = df_igp.dropna(subset=["fecha_hora_utc"]).sort_values("fecha_hora_utc").reset_index(drop=True)
print(f"   -> Registros IGP válidos cargados: {len(df_igp)}")

# 2. Cargar catálogo USGS (vía archivo local o API REST de FDSNWS)
if not os.path.exists(RUTA_USGS_CSV):
    print("2. Descargando los 13,890 registros de la API oficial de la USGS...")
    url_usgs = (
        "https://earthquake.usgs.gov/fdsnws/event/1/query.geojson?"
        "starttime=1960-01-01%2000:00:00&endtime=2026-10-03%2023:59:59"
        "&maxlatitude=1.063&minlatitude=-20.345&maxlongitude=-66.419&minlongitude=-88.268"
        "&minmagnitude=3&orderby=time"
    )
    req = urllib.request.Request(url_usgs, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        data_usgs = json.loads(response.read().decode("utf-8"))

    filas_usgs = []
    for f in data_usgs["features"]:
        p = f["properties"]
        c = f["geometry"]["coordinates"]
        filas_usgs.append({
            "id_usgs": f["id"],
            "fecha_hora_utc": pd.to_datetime(p["time"], unit="ms"),
            "lat_usgs": c[1],
            "lon_usgs": c[0],
            "prof_usgs": c[2],
            "mag_usgs": p["mag"],
            "mmi_usgs": p["mmi"],
            "cdi_usgs": p["cdi"],
            "tsunami_usgs": p["tsunami"],
            "sig_usgs": p["sig"],
            "lugar_usgs": p["place"]
        })
    df_usgs = pd.DataFrame(filas_usgs)
    df_usgs.to_csv(RUTA_USGS_CSV, index=False)
else:
    print(f"2. Cargando catálogo USGS local desde {RUTA_USGS_CSV}...")
    df_usgs = pd.read_csv(RUTA_USGS_CSV)

df_usgs["fecha_hora_utc"] = pd.to_datetime(df_usgs["fecha_hora_utc"], format="mixed").astype("datetime64[ms]")
df_usgs = df_usgs.sort_values("fecha_hora_utc").reset_index(drop=True)

# 3. Cruce temporal inteligente (Fuzzy Time Join de +-15 segundos)
print("3. Cruzando catálogos IGP y USGS (ventana de +-15 segundos)...")
df_maestro = pd.merge_asof(
    df_igp,
    df_usgs,
    on="fecha_hora_utc",
    direction="nearest",
    tolerance=pd.Timedelta("15s")
)

# Filtro espacial: descartar emparejamientos lejanos (> 1.5 grados)
dist_grados = np.sqrt((df_maestro["latitud"] - df_maestro["lat_usgs"])**2 + (df_maestro["longitud"] - df_maestro["lon_usgs"])**2)
mask_falso_cruce = dist_grados > 1.5
cols_usgs = ["id_usgs", "lat_usgs", "lon_usgs", "prof_usgs", "mag_usgs", "mmi_usgs", "cdi_usgs", "tsunami_usgs", "sig_usgs", "lugar_usgs"]
df_maestro.loc[mask_falso_cruce, cols_usgs] = np.nan

coincidencias = df_maestro["id_usgs"].notna().sum()
print(f"   -> Sismos emparejados exitosamente entre IGP y USGS: {coincidencias}")

# 4. Construcción de Etiquetas (Targets) 100% Empíricas
print("4. Generando variables objetivo con datos reales (sin imputación sintética)...")

# A) Etiqueta de Tsunami: Ecuación diagonal de la costa peruana + profundidad superficial <= 60 km
lon_limite_costa = -83.5 - 0.72 * df_maestro["latitud"]
en_zona_costera_marina = (df_maestro["longitud"] <= lon_limite_costa) & (df_maestro["latitud"] <= -3.3)
es_superficial = df_maestro["profundidad_km"] <= 60

df_maestro["alerta_tsunami"] = np.where(
    en_zona_costera_marina & es_superficial & (
        (df_maestro["magnitud"] >= 7.0) | 
        ((df_maestro["tsunami_usgs"] == 1) & (df_maestro["magnitud"] >= 6.7))
    ),
    1, 0
)

# B) Intensidad Mercalli: SOLO datos 100% reales medidos por USGS (MMI instrumental o CDI ciudadano)
# Los sismos sin reporte quedan como NaN para evitar contaminar el clasificador con fórmulas sintéticas
df_maestro["intensidad_mercalli"] = df_maestro["mmi_usgs"].combine_first(df_maestro["cdi_usgs"]).round(1)

# C) Nivel de Impacto en 3 clases (solo se asigna a los 1,122 casos reales; el resto queda NaN)
df_maestro["nivel_impacto"] = pd.cut(
    df_maestro["intensidad_mercalli"],
    bins=[0, 3.9, 5.4, 12.0],
    labels=["Leve (I-III)", "Moderado (IV-V)", "Fuerte/Severo (VI+)"]
)

# 5. Guardar Dataset Maestro
df_maestro.to_csv(RUTA_MAESTRO, index=False)
print("\n" + "="*60)
print(f"¡ÉXITO! Dataset maestro (100% datos reales) guardado en: {RUTA_MAESTRO}")
print("="*60)
print(f"\nTotal de sismos para Clustering (Módulo 2): {len(df_maestro)}")
print(f"Total de sismos con Intensidad Real para Clasificación (Módulo 1): {df_maestro['nivel_impacto'].notna().sum()}")
print("\nDistribución de Clases Reales de Impacto (USGS):")
print(df_maestro["nivel_impacto"].value_counts())
print("\nResumen de Alertas de Tsunami (0 = No, 1 = Sí):")
print(df_maestro["alerta_tsunami"].value_counts())
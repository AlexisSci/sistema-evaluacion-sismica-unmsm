import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

# Configuración de estilo visual para publicaciones académicas
plt.style.use("seaborn-v0_8-whitegrid")
plt.rcParams["figure.dpi"] = 300
plt.rcParams["font.size"] = 10

RUTA_MAESTRO = os.path.join("data", "dataset_sismico_maestro.csv")
CARPETA_FIGURAS = os.path.join("reports", "figures")
os.makedirs(CARPETA_FIGURAS, exist_ok=True)

print("1. Cargando dataset maestro...")
df = pd.read_csv(RUTA_MAESTRO)
print(f"   -> Total de registros cargados (Catálogo IGP completo): {len(df)}")

# Clasificación geofísica por profundidad hipocentral (criterio IGP)
df["regimen_profundidad"] = pd.cut(
    df["profundidad_km"],
    bins=[-1, 60, 300, 1000],
    labels=["Superficial (<=60 km)", "Intermedio (61-300 km)", "Profundo (>300 km)"]
)

# Subconjunto de 1,119 casos con intensidad empírica real (USGS)
df_real = df.dropna(subset=["nivel_impacto"]).copy()
orden_clases = ["Leve (I-III)", "Moderado (IV-V)", "Fuerte/Severo (VI+)"]

# ==============================================================================
# REPORTE ESTADÍSTICO EN CONSOLA
# ==============================================================================
print("\n" + "="*65)
print("RESUMEN ESTADÍSTICO GLOBAL (25,764 SISMOS - MÓDULO CLUSTERING)")
print("="*65)
print(df[["latitud", "longitud", "profundidad_km", "magnitud"]].describe().round(2))

print("\nDistribución por Régimen de Profundidad (Criterio IGP):")
conteo_prof = df["regimen_profundidad"].value_counts()
porc_prof = (df["regimen_profundidad"].value_counts(normalize=True) * 100).round(2)
print(pd.DataFrame({"Conteo": conteo_prof, "Porcentaje (%)": porc_prof}))

print("\n" + "="*65)
print("RESUMEN SUBCONJUNTO EMPÍRICO USGS (1,119 SISMOS - MÓDULO CLASIFICACIÓN)")
print("="*65)
print(df_real.groupby("nivel_impacto", observed=False)[["magnitud", "profundidad_km", "intensidad_mercalli"]].agg(["count", "mean", "std", "median"]).round(2))

# ==============================================================================
# GRÁFICO 1: DISTRIBUCIÓN DE MAGNITUDES (GUTENBERG-RICHTER) Y PROFUNDIDAD
# ==============================================================================
print("\n2. Generando Gráfico 1: Distribución de Magnitudes y Profundidades...")
fig, axes = plt.subplots(1, 2, figsize=(13, 5))

# Panel A: Magnitudes en escala logarítmica (Ley de Gutenberg-Richter)
sns.histplot(df["magnitud"], bins=35, kde=False, color="#1f77b4", edgecolor="black", ax=axes[0])
axes[0].set_yscale("log")
axes[0].set_title("A) Distribución de Magnitudes (Escala Log - Gutenberg-Richter)", fontweight="bold")
axes[0].set_xlabel("Magnitud (M)")
axes[0].set_ylabel("Frecuencia de Sismos (Escala Log10)")
axes[0].axvline(7.0, color="red", linestyle="--", label="Umbral Tsunamigénico (M >= 7.0)")
axes[0].legend()

# Panel B: Régimen de Profundidad
colores_prof = ["#e74c3c", "#f39c12", "#2ecc71"]
sns.countplot(
    data=df,
    x="regimen_profundidad",
    hue="regimen_profundidad",
    palette=colores_prof,
    legend=False,
    ax=axes[1]
)
axes[1].set_title("B) Sismicidad por Régimen de Profundidad Hipocentral", fontweight="bold")
axes[1].set_xlabel("Clasificación Geofísica de Profundidad")
axes[1].set_ylabel("Cantidad de Sismos")
for container in axes[1].containers:
    axes[1].bar_label(container, fmt="%d", padding=3, fontweight="bold")

plt.tight_layout()
ruta_fig1 = os.path.join(CARPETA_FIGURAS, "01_distribucion_magnitud_profundidad.png")
plt.savefig(ruta_fig1)
plt.close()

# ==============================================================================
# GRÁFICO 2: PERFIL DE SUBDUCCIÓN DE LA PLACA DE NAZCA (WADATI-BENIOFF)
# ==============================================================================
print("3. Generando Gráfico 2: Perfil de Subducción (Zona de Wadati-Benioff)...")
plt.figure(figsize=(11, 6))
scatter = plt.scatter(
    df["longitud"],
    df["profundidad_km"],
    c=df["magnitud"],
    cmap="viridis",
    alpha=0.45,
    s=df["magnitud"] ** 2.2,
    edgecolors="none"
)
plt.gca().invert_yaxis()  # Invertir eje Y para representar profundidad hacia el interior de la Tierra
plt.axhline(60, color="red", linestyle="--", linewidth=1.2, label="Límite Superficial (60 km)")
plt.axhline(300, color="orange", linestyle="--", linewidth=1.2, label="Límite Intermedio (300 km)")
cbar = plt.colorbar(scatter)
cbar.set_label("Magnitud Sísmica (M)")
plt.title("Perfil Transversal de Subducción de la Placa de Nazca (Longitud vs. Profundidad)", fontweight="bold")
plt.xlabel("Longitud Geográfica (° Oeste -> Este: Fosa Marina hacia la Selva Amazónica)")
plt.ylabel("Profundidad Hipocentral (km)")
plt.legend(loc="lower left")
plt.tight_layout()
ruta_fig2 = os.path.join(CARPETA_FIGURAS, "02_perfil_subduccion_wadati_benioff.png")
plt.savefig(ruta_fig2)
plt.close()

# ==============================================================================
# GRÁFICO 3: MAPA ESPACIAL DE SISMICIDAD Y LOS 16 TSUNAMIS HISTÓRICOS
# ==============================================================================
print("4. Generando Gráfico 3: Mapa Espacial de Sismicidad y Eventos Tsunamigénicos...")
plt.figure(figsize=(8, 9))

# Sismos normales coloreados por régimen de profundidad
sns.scatterplot(
    data=df[df["alerta_tsunami"] == 0],
    x="longitud",
    y="latitud",
    hue="regimen_profundidad",
    palette=colores_prof,
    alpha=0.35,
    s=12,
    edgecolor="none"
)

# Resaltar los 16 eventos tsunamigénicos
df_tsu = df[df["alerta_tsunami"] == 1]
plt.scatter(
    df_tsu["longitud"],
    df_tsu["latitud"],
    color="blue",
    marker="*",
    s=180,
    edgecolor="black",
    linewidth=0.8,
    label=f"Tsunamis Confirmados (n={len(df_tsu)})",
    zorder=5
)

# Trazar la recta diagonal del filtro geofísico costero
lat_vals = np.linspace(-19.5, -3.3, 100)
lon_limite = -83.5 - 0.72 * lat_vals
plt.plot(lon_limite, lat_vals, color="black", linestyle="--", linewidth=1.5, label="Frontera Costera/Marina DHN")

plt.title("Distribución Geoespacial de Sismos en el Perú y Eventos Tsunamigénicos (1960-2026)", fontweight="bold")
plt.xlabel("Longitud (°)")
plt.ylabel("Latitud (°)")
plt.xlim(-86, -67)
plt.ylim(-20.5, 0.5)
plt.legend(loc="upper right", frameon=True)
plt.tight_layout()
ruta_fig3 = os.path.join(CARPETA_FIGURAS, "03_mapa_espacial_y_tsunamis.png")
plt.savefig(ruta_fig3)
plt.close()

# ==============================================================================
# GRÁFICO 4: ANÁLISIS DE LAS 3 CLASES REALES DE IMPACTO (N = 1,119)
# ==============================================================================
print("5. Generando Gráfico 4: Boxplots y Correlación de Impacto Real (USGS n=1,119)...")
fig, axes = plt.subplots(1, 3, figsize=(16, 5))

# Panel A: Magnitud vs Nivel de Impacto
sns.boxplot(
    data=df_real,
    x="nivel_impacto",
    y="magnitud",
    order=orden_clases,
    hue="nivel_impacto",
    palette=["#2ecc71", "#f1c40f", "#e74c3c"],
    legend=False,
    ax=axes[0]
)
axes[0].set_title("A) Magnitud según Nivel de Impacto Real", fontweight="bold")
axes[0].set_xlabel("Nivel de Impacto (Mercalli)")
axes[0].set_ylabel("Magnitud (M)")

# Panel B: Profundidad vs Nivel de Impacto
sns.boxplot(
    data=df_real,
    x="nivel_impacto",
    y="profundidad_km",
    order=orden_clases,
    hue="nivel_impacto",
    palette=["#2ecc71", "#f1c40f", "#e74c3c"],
    legend=False,
    ax=axes[1]
)
axes[1].set_title("B) Profundidad según Nivel de Impacto Real", fontweight="bold")
axes[1].set_xlabel("Nivel de Impacto (Mercalli)")
axes[1].set_ylabel("Profundidad (km)")

# Panel C: Matriz de Correlación de Pearson (1,119 sismos reales)
cols_corr = ["latitud", "longitud", "profundidad_km", "magnitud", "intensidad_mercalli"]
corr_matrix = df_real[cols_corr].corr()
sns.heatmap(
    corr_matrix,
    annot=True,
    fmt=".2f",
    cmap="coolwarm",
    vmin=-1,
    vmax=1,
    cbar=False,
    ax=axes[2]
)
axes[2].set_title("C) Correlación Empírica (n=1,119)", fontweight="bold")

plt.tight_layout()
ruta_fig4 = os.path.join(CARPETA_FIGURAS, "04_impacto_real_usgs_1119.png")
plt.savefig(ruta_fig4)
plt.close()

print("\n" + "="*65)
print(f"¡EDA COMPLETADO CON ÉXITO! Las 4 figuras se guardaron en: {CARPETA_FIGURAS}")
print("="*65)
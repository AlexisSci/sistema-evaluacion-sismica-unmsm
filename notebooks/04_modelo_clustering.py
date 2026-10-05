import os
import joblib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans, DBSCAN
from sklearn.metrics import silhouette_score, davies_bouldin_score

# Configuración gráfica académica
plt.style.use("seaborn-v0_8-whitegrid")
plt.rcParams["figure.dpi"] = 300
plt.rcParams["font.size"] = 10

RUTA_MAESTRO = os.path.join("data", "dataset_sismico_maestro.csv")
CARPETA_MODELOS = "models"
CARPETA_FIGURAS = os.path.join("reports", "figures")
os.makedirs(CARPETA_MODELOS, exist_ok=True)
os.makedirs(CARPETA_FIGURAS, exist_ok=True)

print("1. Cargando catálogo completo del IGP (25,764 sismos)...")
df = pd.read_csv(RUTA_MAESTRO)
print(f"   -> Total de eventos para análisis espacial: {len(df)}")

# ==============================================================================
# 2. MACRO-ZONIFICACIÓN SISMOGÉNICA 3D (K-MEANS + ESCALADO ESTÁNDAR)
# ==============================================================================
print("\n2. Evaluando número óptimo de zonas sismogénicas 3D (K-Means)...")
cols_espaciales = ["latitud", "longitud", "profundidad_km"]
scaler = StandardScaler()
X_scaled = scaler.fit_transform(df[cols_espaciales])

rango_k = range(3, 8)
resultados_k = []
for k in rango_k:
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    etiquetas = km.fit_predict(X_scaled)
    sil = silhouette_score(X_scaled, etiquetas, sample_size=10000, random_state=42)
    dbi = davies_bouldin_score(X_scaled, etiquetas)
    resultados_k.append({
        "K (Clusters)": k,
        "Inercia (WCSS)": round(km.inertia_, 1),
        "Silhouette Score (↑)": round(sil, 4),
        "Davies-Bouldin Index (↓)": round(dbi, 4)
    })

df_eval_k = pd.DataFrame(resultados_k)
print("\n" + "="*68)
print("EVALUACIÓN DE PARTICIONES TECTÓNICAS 3D (K-MEANS SOBRE 25,764 SISMOS)")
print("="*68)
print(df_eval_k.to_string(index=False))

mejor_fila = df_eval_k.loc[df_eval_k["Silhouette Score (↑)"].idxmax()]
k_optimo = int(mejor_fila["K (Clusters)"])
print(f"\n   -> Número óptimo seleccionado matemáticamente: K = {k_optimo} zonas sismogénicas")

kmeans_final = KMeans(n_clusters=k_optimo, random_state=42, n_init=10)
df["zona_kmeans"] = kmeans_final.fit_predict(X_scaled)

resumen_zonas = df.groupby("zona_kmeans").agg(
    Cantidad_Sismos=("magnitud", "count"),
    Latitud_Media=("latitud", "mean"),
    Longitud_Media=("longitud", "mean"),
    Profundidad_Media_km=("profundidad_km", "mean"),
    Magnitud_Media=("magnitud", "mean"),
    Magnitud_Max=("magnitud", "max")
).round(2).sort_values("Profundidad_Media_km")

print("\n" + "="*68)
print(f"CARACTERIZACIÓN GEOFÍSICA DE LAS {k_optimo} MACRO-ZONAS SISMOGÉNICAS")
print("="*68)
print(resumen_zonas.to_string())

# ==============================================================================
# 3. DETECCIÓN DE ENJAMBRES SÍSMICOS (DBSCAN + MÉTRICA GEODÉSICA HAVERSINE)
# ==============================================================================
print("\n3. Ejecutando DBSCAN Geoespacial (Haversine) para detectar Enjambres Superficiales...")

df_sup = df[df["profundidad_km"] <= 60.0].copy().reset_index(drop=True)
coords_rad = np.radians(df_sup[["latitud", "longitud"]].values)

RADIO_KM = 18.0
MIN_SISMOS = 80
eps_rad = RADIO_KM / 6371.0

dbscan = DBSCAN(eps=eps_rad, min_samples=MIN_SISMOS, metric="haversine", n_jobs=-1)
df_sup["cluster_enjambre"] = dbscan.fit_predict(coords_rad)

df_enjambres = df_sup[df_sup["cluster_enjambre"] != -1].copy()
n_enjambres = df_enjambres["cluster_enjambre"].nunique()
porc_enjambre = (len(df_enjambres) / len(df_sup)) * 100

print(f"   -> Sismos superficiales analizados (<=60 km): {len(df_sup)}")
print(f"   -> Enjambres / Nidos sísmicos de alta densidad detectados: {n_enjambres}")
print(f"   -> Sismos concentrados en enjambres: {len(df_enjambres)} ({porc_enjambre:.2f}% del total superficial)")
print(f"   -> Sismicidad de fondo dispersa (Ruido = -1): {len(df_sup) - len(df_enjambres)}")

tabla_enjambres = df_enjambres.groupby("cluster_enjambre").agg(
    Sismos_Enjambre=("magnitud", "count"),
    Lat_Centro=("latitud", "mean"),
    Lon_Centro=("longitud", "mean"),
    Prof_Media_km=("profundidad_km", "mean"),
    Mag_Media=("magnitud", "mean"),
    Mag_Max=("magnitud", "max")
).round(2).sort_values("Sismos_Enjambre", ascending=False)

print("\n" + "="*68)
print("TODOS LOS ENJAMBRES Y NIDOS SÍSMICOS DETECTADOS POR DBSCAN (11 NÚCLEOS)")
print("="*68)
print(tabla_enjambres.to_string())

# ==============================================================================
# 4. GENERACIÓN DE FIGURA CIENTÍFICA MEJORADA 06_clustering_zonas_y_enjambres.png
# ==============================================================================
print("\n4. Generando figura mejorada 06_clustering_zonas_y_enjambres.png...")
fig, axes = plt.subplots(1, 3, figsize=(19, 6.2))

# ------------------------------------------------------------------------------
# Panel A: Curva de Silhouette Score y Davies-Bouldin con leyenda arriba a la derecha
# ------------------------------------------------------------------------------
ax1 = axes[0]
color_sil = "#1f77b4"
color_dbi = "#e74c3c"

l1 = ax1.plot(
    df_eval_k["K (Clusters)"], df_eval_k["Silhouette Score (↑)"],
    marker="o", linewidth=2.2, color=color_sil, label="Silhouette Score (↑)"
)
ax1.set_xlabel("Número de Clusters (K)")
ax1.set_ylabel("Silhouette Score (Mayor es mejor)", color=color_sil, fontweight="bold")
ax1.tick_params(axis="y", labelcolor=color_sil)
ax1.set_ylim(0.36, 0.442)  # Espacio superior limpio para que no choque la leyenda

l3 = ax1.axvline(k_optimo, color="black", linestyle="--", linewidth=1.6, label=f"K Óptimo = {k_optimo}")

ax1_twin = ax1.twinx()
l2 = ax1_twin.plot(
    df_eval_k["K (Clusters)"], df_eval_k["Davies-Bouldin Index (↓)"],
    marker="s", linewidth=2.2, linestyle="-.", color=color_dbi, label="Davies-Bouldin (↓)"
)
ax1_twin.set_ylabel("Davies-Bouldin Index (Menor es mejor)", color=color_dbi, fontweight="bold")
ax1_twin.tick_params(axis="y", labelcolor=color_dbi)
ax1_twin.set_ylim(0.68, 1.12)
ax1_twin.grid(False)

# Combinar las 3 leyendas en un recuadro limpio en la esquina superior derecha
lineas = l1 + l2 + [l3]
etiquetas_leg = [l.get_label() for l in lineas]
ax1.legend(
    lineas, etiquetas_leg,
    loc="upper right", frameon=True, facecolor="white", framealpha=0.95, edgecolor="#cccccc"
)
ax1.set_title("A) Selección Matemática de K (K-Means 3D)", fontweight="bold")

# ------------------------------------------------------------------------------
# Panel B: Mapa de Macro-Zonas Sismogénicas (K-Means, n=25,764)
# ------------------------------------------------------------------------------
etiquetas_zonas = {
    0: "Zona 0: Costa/Sur (n=11,326)",
    1: "Zona 1: Costa/Norte-Centro (n=7,756)",
    2: "Zona 2: Intermedia Nor-Oriental (n=4,076)",
    3: "Zona 3: Profunda Sur-Oriental (n=2,606)"
}
df["Zona_Etiqueta"] = df["zona_kmeans"].map(etiquetas_zonas)

sns.scatterplot(
    data=df, x="longitud", y="latitud",
    hue="Zona_Etiqueta", hue_order=list(etiquetas_zonas.values()),
    palette="tab10", alpha=0.45, s=12, edgecolor="none", ax=axes[1]
)
axes[1].set_title(f"B) Macro-Zonificación Sismogénica 3D (K-Means, K={k_optimo})", fontweight="bold")
axes[1].set_xlabel("Longitud (°)")
axes[1].set_ylabel("Latitud (°)")
axes[1].set_xlim(-85, -67)
axes[1].set_ylim(-20.5, 0.5)
axes[1].legend(title="Macro-Zonas Tectónicas", loc="upper right", frameon=True, facecolor="white", framealpha=0.9, fontsize=8.5)

# ------------------------------------------------------------------------------
# Panel C: Los 11 Enjambres Sísmicos numerados sin obstruir la visión
# ------------------------------------------------------------------------------
df_ruido = df_sup[df_sup["cluster_enjambre"] == -1]
axes[2].scatter(
    df_ruido["longitud"], df_ruido["latitud"],
    color="#cfd8dc", alpha=0.25, s=7, label="Sismicidad Dispersa (Ruido)"
)

# Paleta de 11 colores bien diferenciados para los 11 enjambres
paleta_11 = sns.color_palette("tab20", n_enjambres)
orden_clusters = list(tabla_enjambres.index)

for idx_rank, cluster_id in enumerate(orden_clusters):
    sub_c = df_enjambres[df_enjambres["cluster_enjambre"] == cluster_id]
    row = tabla_enjambres.loc[cluster_id]
    color_c = paleta_11[idx_rank]
    
    # Graficar los puntos del enjambre y registrarlos en la leyenda con su conteo y coordenadas
    axes[2].scatter(
        sub_c["longitud"], sub_c["latitud"],
        color=color_c, alpha=0.85, s=22, edgecolors="none",
        label=f"#{cluster_id}: {int(row['Sismos_Enjambre'])} sismos ({row['Lat_Centro']:.1f}°, {row['Lon_Centro']:.1f}°)"
    )
    
    # Colocar un pequeño círculo numerado justo al lado del núcleo sin taparlo
    offset_lon = -0.75 if cluster_id != 9 else 0.65
    axes[2].text(
        row["Lon_Centro"] + offset_lon, row["Lat_Centro"],
        f"#{cluster_id}",
        fontsize=7.5, fontweight="bold", color="black",
        ha="center", va="center",
        bbox=dict(boxstyle="circle,pad=0.18", fc="white", ec=color_c, lw=1.4, alpha=0.92)
    )

axes[2].set_title(f"C) Detección de Enjambres Corticales (DBSCAN: {n_enjambres} Núcleos)", fontweight="bold")
axes[2].set_xlabel("Longitud (°)")
axes[2].set_ylabel("Latitud (°)")
axes[2].set_xlim(-85, -66.5)
axes[2].set_ylim(-20.5, 0.5)
axes[2].legend(
    title="11 Enjambres (ID: Conteo y Centro)",
    loc="upper right", frameon=True, facecolor="white", framealpha=0.92,
    fontsize=7.2, title_fontsize=8.0, markerscale=1.2
)

plt.tight_layout()
ruta_fig6 = os.path.join(CARPETA_FIGURAS, "06_clustering_zonas_y_enjambres.png")
plt.savefig(ruta_fig6)
plt.close()

# ==============================================================================
# 5. EXPORTAR MODELOS Y RESULTADOS DE CLUSTERING PARA STREAMLIT
# ==============================================================================
artefacto_clustering = {
    "scaler_3d": scaler,
    "kmeans_model": kmeans_final,
    "k_optimo": k_optimo,
    "resumen_zonas_kmeans": resumen_zonas,
    "tabla_enjambres_dbscan": tabla_enjambres,
    "parametros_dbscan": {"radio_km": RADIO_KM, "min_sismos": MIN_SISMOS}
}
ruta_pkl_cluster = os.path.join(CARPETA_MODELOS, "modelo_clustering.pkl")
joblib.dump(artefacto_clustering, ruta_pkl_cluster)

print("\n" + "="*68)
print("¡FIGURA 06 ACTUALIZADA CON LOS 11 ENJAMBRES Y LEYENDAS ORDENADAS!")
print(f"-> Figura guardada en: {ruta_fig6}")
print("="*68)
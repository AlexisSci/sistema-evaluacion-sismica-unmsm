import os
import joblib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

from sklearn.model_selection import train_test_split, StratifiedKFold, cross_validate
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    f1_score,
    accuracy_score,
    balanced_accuracy_score
)
from sklearn.utils.class_weight import compute_sample_weight
from xgboost import XGBClassifier

# Configuración gráfica
plt.style.use("seaborn-v0_8-whitegrid")
plt.rcParams["figure.dpi"] = 300
plt.rcParams["font.size"] = 10

RUTA_MAESTRO = os.path.join("data", "dataset_sismico_maestro.csv")
CARPETA_MODELOS = "models"
CARPETA_FIGURAS = os.path.join("reports", "figures")
os.makedirs(CARPETA_MODELOS, exist_ok=True)
os.makedirs(CARPETA_FIGURAS, exist_ok=True)

print("1. Cargando dataset maestro y filtrando casos 100% reales (USGS)...")
df = pd.read_csv(RUTA_MAESTRO)

# Filtrar estrictamente los 1,119 registros con nivel_impacto real verificado
df_clf = df.dropna(subset=["nivel_impacto"]).copy().reset_index(drop=True)
print(f"   -> Total de sismos empíricos para entrenamiento y prueba: {len(df_clf)}")

# ==============================================================================
# 2. SELECCIÓN DE VARIABLES ORIGINALES PURAS DEL IGP (CERO MULTICOLINEALIDAD)
# ==============================================================================
print("2. Seleccionando las 4 variables físicas fundamentales del IGP...")

nombres_features = ["latitud", "longitud", "profundidad_km", "magnitud"]
X = df_clf[nombres_features].copy()

# Codificación ordenada de la variable objetivo (0: Leve, 1: Moderado, 2: Fuerte/Severo)
orden_clases = ["Leve (I-III)", "Moderado (IV-V)", "Fuerte/Severo (VI+)"]
mapa_clases = {nombre: idx for idx, nombre in enumerate(orden_clases)}
y = df_clf["nivel_impacto"].map(mapa_clases).astype(int)

# División Estratificada 80% Train (895 sismos) / 20% Test (224 sismos)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.20, random_state=42, stratify=y
)
print(f"   -> Tamaño Train: {len(X_train)} | Tamaño Test: {len(X_test)}")

# ==============================================================================
# 3. MODELOS REGULARIZADOS Y VALIDACIÓN CRUZADA ESTRATIFICADA (5-FOLD CV)
# ==============================================================================
print("\n3. Ejecutando Validación Cruzada Estratificada (5-Fold CV) con regularización...")

# Random Forest regularizado (control de profundidad y hojas mínimas para evitar overfitting)
rf_model = RandomForestClassifier(
    n_estimators=300,
    max_depth=7,
    min_samples_leaf=5,
    class_weight="balanced",
    random_state=42,
    n_jobs=-1
)

# XGBoost regularizado (poda de profundidad max_depth=4 y penalización L2 reg_lambda=3.0)
xgb_model = XGBClassifier(
    n_estimators=200,
    max_depth=4,
    learning_rate=0.04,
    subsample=0.85,
    colsample_bytree=0.85,
    reg_lambda=3.0,
    min_child_weight=4,
    objective="multi:softprob",
    num_class=3,
    eval_metric="mlogloss",
    random_state=42,
    n_jobs=-1
)

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

# Evaluamos Random Forest en CV
cv_rf = cross_validate(
    rf_model, X_train, y_train, cv=cv,
    scoring=["accuracy", "balanced_accuracy", "f1_macro"]
)

# Evaluamos XGBoost con pesos balanceados en cada fold
f1_xgb_folds, acc_xgb_folds, bacc_xgb_folds = [], [], []
for train_idx, val_idx in cv.split(X_train, y_train):
    X_tr, X_val = X_train.iloc[train_idx], X_train.iloc[val_idx]
    y_tr, y_val = y_train.iloc[train_idx], y_train.iloc[val_idx]
    pesos_tr = compute_sample_weight("balanced", y_tr)
    
    xgb_clone = XGBClassifier(**xgb_model.get_params())
    xgb_clone.fit(X_tr, y_tr, sample_weight=pesos_tr)
    preds_val = xgb_clone.predict(X_val)
    
    acc_xgb_folds.append(accuracy_score(y_val, preds_val))
    bacc_xgb_folds.append(balanced_accuracy_score(y_val, preds_val))
    f1_xgb_folds.append(f1_score(y_val, preds_val, average="macro"))

print("\n" + "="*68)
print("RESULTADOS DE VALIDACIÓN CRUZADA (5-FOLD ESTRATIFICADO EN TRAIN)")
print("="*68)
resumen_cv = pd.DataFrame({
    "Modelo (4 Vars Puras IGP)": ["Random Forest (Regularizado)", "XGBoost (Regularizado)"],
    "Accuracy (Media ± Std)": [
        f"{np.mean(cv_rf['test_accuracy']):.4f} ± {np.std(cv_rf['test_accuracy']):.4f}",
        f"{np.mean(acc_xgb_folds):.4f} ± {np.std(acc_xgb_folds):.4f}"
    ],
    "Balanced Acc (Media ± Std)": [
        f"{np.mean(cv_rf['test_balanced_accuracy']):.4f} ± {np.std(cv_rf['test_balanced_accuracy']):.4f}",
        f"{np.mean(bacc_xgb_folds):.4f} ± {np.std(bacc_xgb_folds):.4f}"
    ],
    "F1-Macro (Media ± Std)": [
        f"{np.mean(cv_rf['test_f1_macro']):.4f} ± {np.std(cv_rf['test_f1_macro']):.4f}",
        f"{np.mean(f1_xgb_folds):.4f} ± {np.std(f1_xgb_folds):.4f}"
    ]
})
print(resumen_cv.to_string(index=False))

# ==============================================================================
# 4. ENTRENAMIENTO FINAL Y CONTROL DE OVERFITTING (TRAIN VS TEST)
# ==============================================================================
print("\n4. Evaluando generalización (Train vs Test) en los 224 sismos de prueba...")

# Entrenar Random Forest
rf_model.fit(X_train, y_train)
f1_train_rf = f1_score(y_train, rf_model.predict(X_train), average="macro")
y_pred_rf = rf_model.predict(X_test)
f1_test_rf = f1_score(y_test, y_pred_rf, average="macro")

# Entrenar XGBoost con pesos balanceados
pesos_train_full = compute_sample_weight("balanced", y_train)
xgb_model.fit(X_train, y_train, sample_weight=pesos_train_full)
f1_train_xgb = f1_score(y_train, xgb_model.predict(X_train), average="macro")
y_pred_xgb = xgb_model.predict(X_test)
f1_test_xgb = f1_score(y_test, y_pred_xgb, average="macro")

print(f"   -> Random Forest | Train F1-Macro: {f1_train_rf:.4f} | Test F1-Macro: {f1_test_rf:.4f}")
print(f"   -> XGBoost       | Train F1-Macro: {f1_train_xgb:.4f} | Test F1-Macro: {f1_test_xgb:.4f}")

print("\n" + "-"*68)
print(f"REPORTE DE CLASIFICACIÓN EN TEST: RANDOM FOREST (F1-Macro = {f1_test_rf:.4f})")
print("-"*68)
print(classification_report(y_test, y_pred_rf, target_names=orden_clases, digits=3))

print("-"*68)
print(f"REPORTE DE CLASIFICACIÓN EN TEST: XGBOOST (F1-Macro = {f1_test_xgb:.4f})")
print("-"*68)
print(classification_report(y_test, y_pred_xgb, target_names=orden_clases, digits=3))

# ==============================================================================
# 5. GRÁFICA COMPARATIVA DE MATRICES DE CONFUSIÓN E IMPORTANCIA DE VARIABLES
# ==============================================================================
print("5. Actualizando figura 05_evaluacion_clasificador_impacto.png...")
fig, axes = plt.subplots(1, 3, figsize=(17, 5))

# Panel A: Matriz de Confusión Random Forest
cm_rf = confusion_matrix(y_test, y_pred_rf)
sns.heatmap(cm_rf, annot=True, fmt="d", cmap="Blues", cbar=False,
            xticklabels=orden_clases, yticklabels=orden_clases, ax=axes[0])
axes[0].set_title(f"A) Matriz de Confusión: Random Forest\n(F1-Macro Test = {f1_test_rf:.3f})", fontweight="bold")
axes[0].set_xlabel("Predicción del Modelo")
axes[0].set_ylabel("Clase Real (USGS)")
axes[0].tick_params(axis="x", rotation=15)

# Panel B: Matriz de Confusión XGBoost
cm_xgb = confusion_matrix(y_test, y_pred_xgb)
sns.heatmap(cm_xgb, annot=True, fmt="d", cmap="Greens", cbar=False,
            xticklabels=orden_clases, yticklabels=orden_clases, ax=axes[1])
axes[1].set_title(f"B) Matriz de Confusión: XGBoost\n(F1-Macro Test = {f1_test_xgb:.3f})", fontweight="bold")
axes[1].set_xlabel("Predicción del Modelo")
axes[1].set_ylabel("Clase Real (USGS)")
axes[1].tick_params(axis="x", rotation=15)

# Selección del mejor modelo según F1-Macro en Test
if f1_test_xgb >= f1_test_rf:
    mejor_modelo = xgb_model
    nombre_ganador = "XGBoost"
    importancias = xgb_model.feature_importances_
else:
    mejor_modelo = rf_model
    nombre_ganador = "Random Forest"
    importancias = rf_model.feature_importances_

# Panel C: Importancia de las 4 Variables Originales del IGP
df_imp = pd.DataFrame({
    "Variable": nombres_features,
    "Importancia": importancias
}).sort_values("Importancia", ascending=True)

axes[2].barh(df_imp["Variable"], df_imp["Importancia"], color="#2c3e50", edgecolor="black")
axes[2].set_title(f"C) Importancia de Variables IGP ({nombre_ganador})", fontweight="bold")
axes[2].set_xlabel("Importancia Relativa (Gini / Gain)")

plt.tight_layout()
ruta_fig5 = os.path.join(CARPETA_FIGURAS, "05_evaluacion_clasificador_impacto.png")
plt.savefig(ruta_fig5)
plt.close()

# ==============================================================================
# 6. GUARDAR MODELO GANADOR PARA PRODUCCIÓN (STREAMLIT)
# ==============================================================================
artefacto_modelo = {
    "modelo": mejor_modelo,
    "nombre_modelo": nombre_ganador,
    "features": nombres_features,
    "clases": orden_clases,
    "f1_macro_test": max(f1_test_rf, f1_test_xgb)
}
ruta_pkl = os.path.join(CARPETA_MODELOS, "clasificador_impacto.pkl")
joblib.dump(artefacto_modelo, ruta_pkl)

print("\n" + "="*68)
print(f"¡MÓDULO 1 ACTUALIZADO (4 VARS PURAS)! Modelo ganador: {nombre_ganador}")
print(f"-> Modelo exportado en: {ruta_pkl}")
print(f"-> Figura actualizada en: {ruta_fig5}")
print("="*68)
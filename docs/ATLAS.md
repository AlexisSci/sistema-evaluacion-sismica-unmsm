# Atlas sísmico del Perú

## Recorrido

La pantalla inicial es el atlas. Los filtros de años, magnitud y profundidad se combinan con una zona rectangular opcional. La reproducción muestra **un año cada vez**, conservando los demás filtros. «Todo el intervalo» recupera la selección completa. El mapa, la radiografía y la lista comparten los mismos registros.

«Seleccionar zona» toma dos esquinas en el mapa. «Corte de profundidad» toma dos extremos: el gráfico usa la distancia sobre el gran círculo y profundidad creciente hacia abajo, incluyendo eventos cuya distancia transversal es menor que la mitad del ancho de la franja. También hay formularios de coordenadas y un corte de ejemplo. Escape cancela el dibujo en curso.

Seleccionar un evento abre su ficha; «Llevar al laboratorio» copia sus cuatro parámetros y lo excluye de los eventos similares. Los cinco similares minimizan `hypot(delta_magnitud / std_magnitud, delta_profundidad / std_profundidad)`, con desviaciones poblacionales del catálogo completo. La distancia geográfica desempata. El radio opcional no se amplía automáticamente. Modificar parámetros no envía predicciones: solo el botón consulta FastAPI.

El pasaporte se genera en el navegador, con un mapa dedicado. Si la cartografía falla, usa el contorno local de Perú. El PDF contiene datos históricos y fuentes, sin incluir una predicción. Los campos ausentes se señalan explícitamente.

## Datos y auditoría

Ejecutar desde la raíz:

```powershell
.venv\Scripts\python -m pip install -r scripts/requirements.txt
.venv\Scripts\python scripts/export_atlas.py
```

No modifica el Excel, los CSV originales ni los modelos. Publica un manifiesto y un archivo `events-<hash>.json` en `frontend/public/data/`; los identificadores dependen de fecha ISO, hora y cuatro variables físicas, no del orden de exportación. Las incidencias se documentan en `reports/atlas-audit.json`.

Resultado de la primera exportación (versión `786f45f14b0e`):

| Comprobación | Resultado |
|---|---:|
| Eventos conservados / identificadores únicos | 25.764 |
| Fechas procesadas antes con día/mes intercambiados | 9.231 |
| Asociaciones USGS diferentes al catálogo anterior | 3.251 |
| Etiquetas diferentes al catálogo anterior | 646 |
| Asociaciones automáticas publicadas | 8.002 |
| Eventos con intensidad asociada | 1.689 |
| Incidencias de asociación excluidas | 18 |

Las fechas se leen estrictamente como `AAAA-MM-DD` desde el Excel. El cruce revisado exige ±15 segundos, distancia haversine ≤75 km y una asociación única en ambas direcciones. Las coincidencias múltiples no se publican. Este criterio reduce ambigüedad pero no sustituye una validación manual. MMI y CDI se conservan con su procedencia; los límites heredados de clases son ≤3,9 / ≤5,4 / >5,4 y requieren revisión metodológica antes de reentrenar.

K-Means recupera el escalador y modelo existentes. Sus etiquetas coinciden exactamente con las del catálogo original; conserva cuatro grupos, definidos exclusivamente por coordenadas y profundidad. DBSCAN se reproduce sobre 15.717 eventos de profundidad ≤60 km con radio 18 km y `min_samples=80`; hay 11 concentraciones y 11.870 eventos dispersos. Los ID de DBSCAN pertenecen a esta versión exportada y pueden diferir de la figura original por el nuevo orden cronológico. No representan enjambres temporales ni fronteras tectónicas oficiales.

**XGBoost fue entrenado con el catálogo anterior.** El manifiesto indica `trainingCompatible=false` y la interfaz mantiene una advertencia permanente. La prueba de inferencia verifica equivalencia técnica con el artefacto, no calidad científica. No promover a modelo validado hasta reentrenar con fuentes revisadas, seleccionar modelos usando entrenamiento/validación y medir un conjunto independiente.

## Ejecución y recursos

La interfaz conserva `pnpm dev` y la API el comando documentado en ARQUITECTURA.md. Instalar dependencias con `pnpm install --frozen-lockfile`; no mezclar npm y pnpm. El catálogo ya generado se incluye: no es necesario instalar pyarrow ni ejecutar la exportación para abrir el frontend.

La carga del catálogo es local al navegador y los cálculos se ejecutan en un Web Worker. Los módulos cartográfico, de gráficos y de PDF se cargan bajo demanda. No hay base de datos, entrenamiento durante solicitudes, sondeo para mantener Render despierto ni servicios pagados nuevos. Los filtros y el evento seleccionado se conservan en la URL; un escenario editado y el corte no se persisten entre recargas.

Cartografía: [OpenFreeMap / MapLibre](https://openfreemap.org/quick_start/), estilo Positron con atribuciones visibles. La configuración del estilo está alojada localmente; sus teselas requieren internet. El contorno de respaldo proviene de [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/), de dominio público. Archivo original: `ne_110m_admin_0_countries.geojson` del repositorio natural-earth-vector; se conserva solo Perú. Fuentes tipográficas: Google Fonts, con alternativas del sistema. Si WebGL no está disponible, listas, filtros, fichas, gráficos y PDF siguen accesibles.

## Validación

```powershell
.venv\Scripts\python -m pytest scripts/test_atlas.py backend/tests -q
cd frontend
pnpm test
pnpm build
pnpm format:check
```

Las pruebas contrastan cada fila con el Excel, fechas ISO ambiguas, estabilidad de ID, unicidad de asociaciones, límites de cruce, filtros combinados, geometría de la franja, mediana, similitud, radio y persistencia de filtros en URL. La revisión de navegador cubre filtros, capas, selección, laboratorio con y sin API, PDF de una página y vista móvil. Los servidores temporales usan puertos separados y se detienen al concluir.

## Selección de zonas y cortes

El mapa permite dos clics o toques para definir las esquinas de una zona o los extremos A/B de un corte. El primer punto se muestra de inmediato y en escritorio el movimiento del puntero muestra el dibujo provisional. Cancelar, Esc o pulsar otra vez la herramienta activa descarta solo el dibujo pendiente, conservando la selección anterior.

**Ver Perú completo** recupera el encuadre sin borrar filtros. **Quitar zona** elimina el filtro espacial y recupera ese encuadre; **Ver todo el intervalo** elimina la restricción al año de reproducción. **Restablecer exploración** borra filtros y selecciones, y cancela cualquier dibujo pendiente.

El corte muestra una franja calculada con la misma geometría esférica que selecciona sus eventos. **Ver resultado** abre y lleva al gráfico; **Quitar corte** elimina la franja. Los eventos del corte siguen sujetos a los filtros activos.

## Magnitud y filtros propios de la lista

“Mirar por → Magnitud” colorea los puntos en cinco intervalos: M <4, 4–<5, 5–<6, 6–<7 y ≥7, con leyenda visible. El tamaño sigue representando la magnitud; los colores no representan intensidad ni daño.

La línea temporal y los filtros de exploración determinan el conjunto global. “Eventos de la selección” permite restringir solo su lista por intervalo inclusivo de meses UTC y rangos de magnitud/profundidad. Si hay varios años, el intervalo de meses se aplica a cada año. Los extremos de meses se mantienen ordenados. Los controles locales no cambian mapa, radiografía ni corte; los contadores indican la cantidad local y global.

La lista ofrece seis órdenes: fecha reciente/antigua, magnitud mayor/menor y profundidad superficial/profunda. Se filtra y ordena antes de paginar; cambiar controles vuelve a la primera página. El reinicio local recupera todos los meses y rangos físicos; el reinicio global restablece también el orden. Los controles locales se reinician al recargar y no se guardan en la URL.

El corte presenta distancia desde A y profundidad hacia abajo: no reconstruye capas geológicas ni dibuja una falla. Un ancho total de 100 km incorpora eventos hasta 50 km a cada lado. Seleccionar un punto permite consultar su ficha en el mapa.

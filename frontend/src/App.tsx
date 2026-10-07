import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { prepare, predict, type Prediction } from "./api";
import {
  defaults,
  readUrl,
  writeUrl,
  orderEvents,
  filterEventList,
} from "./atlas/engine";
import type {
  Event,
  Manifest,
  Filters,
  Layer,
  Analysis,
  Similar,
  Scenario,
  Segment,
  Bounds,
} from "./atlas/types";
import { dateLabel, palette } from "./atlas/types";
const AtlasMap = lazy(() => import("./atlas/AtlasMap"));
const Charts = lazy(() => import("./atlas/Charts"));
const number = (n: number) => n.toLocaleString("es-PE");
const initial: Scenario = {
  latitud: -12,
  longitud: -77,
  profundidad_km: 30,
  magnitud: 5,
};
function RangePair({
  title,
  min,
  max,
  step = 1,
  values,
  onChange,
  unit = "",
}: {
  title: string;
  min: number;
  max: number;
  step?: number;
  values: [number, number];
  onChange: (v: [number, number]) => void;
  unit?: string;
}) {
  return (
    <fieldset className="range-pair">
      <legend>
        {title} <span>{unit}</span>
      </legend>
      <div>
        {values.map((v, i) => (
          <label key={i}>
            <span>{i ? "Hasta" : "Desde"}</span>
            <input
              aria-label={`${title} ${i ? "máximo" : "mínimo"}`}
              type="number"
              min={i ? values[0] : min}
              max={i ? max : values[1]}
              step={step}
              value={v}
              onChange={(e) => {
                if (!Number.isFinite(e.target.valueAsNumber)) return;
                const next = Math.max(
                  i ? values[0] : min,
                  Math.min(i ? max : values[1], e.target.valueAsNumber),
                );
                onChange(i ? [values[0], next] : [next, values[1]]);
              }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
function EventCard({
  event,
  onSelect,
  active = false,
}: {
  event: Event;
  onSelect: () => void;
  active?: boolean;
}) {
  return (
    <button
      className={`event-row ${active ? "selected" : ""}`}
      onClick={onSelect}
    >
      <span className="magnitude">
        {event.mag.toFixed(1)}
        <small>M</small>
      </span>
      <span>
        <strong>
          {event.place || `${event.lat.toFixed(2)}°, ${event.lon.toFixed(2)}°`}
        </strong>
        <small>{dateLabel(event.date)}</small>
      </span>
      <span className="depth-label">
        {event.depth}
        <small>km</small>
      </span>
    </button>
  );
}
export default function App() {
  const [catalog, setCatalog] = useState<{
      events: Event[];
      manifest: Manifest;
    } | null>(null),
    [loadError, setLoadError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    (async () => {
      const r = await fetch("/data/manifest.json", { signal: abort.signal });
      if (!r.ok) throw new Error("No se pudo cargar el catálogo.");
      const manifest: Manifest = await r.json();
      const d = await fetch(`/data/${manifest.file}`, { signal: abort.signal });
      if (!d.ok) throw new Error("No se encontraron los eventos del catálogo.");
      const events: Event[] = await d.json();
      if (events.length !== manifest.count)
        throw new Error("El catálogo no coincide con su versión.");
      if (!abort.signal.aborted) setCatalog({ events, manifest });
    })().catch((e) => {
      if (!abort.signal.aborted) setLoadError(e.message);
    });
    return () => abort.abort();
  }, []);
  if (loadError)
    return (
      <main className="loading">
        <h1>No pudimos abrir el atlas</h1>
        <p>{loadError}</p>
        <button onClick={() => location.reload()}>Reintentar</button>
      </main>
    );
  if (!catalog)
    return (
      <main className="loading">
        <img className="brand-symbol" src="/tecta.svg" alt="" />
        <h1>Abriendo el atlas de Perú</h1>
        <p>Preparando el catálogo histórico…</p>
      </main>
    );
  return <Atlas {...catalog} />;
}
function Atlas({ events, manifest }: { events: Event[]; manifest: Manifest }) {
  const url = useMemo(() => readUrl(manifest, location.search), [manifest]);
  const [filters, setFilters] = useState<Filters>(url.filters),
    [view, setView] = useState<import("./atlas/types").View>(url.view),
    [layer, setLayer] = useState<Layer>(url.layer),
    [selectedId, setSelectedId] = useState<string | null>(url.selected);
  const [analysis, setAnalysis] = useState<Analysis | null>(null),
    [busy, setBusy] = useState(true),
    [workerError, setWorkerError] = useState(""),
    [segment, setSegment] = useState<Segment | null>(null),
    [width, setWidth] = useState(100),
    [reset, setReset] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1000),
    [page, setPage] = useState(0);
  const [scenario, setScenario] = useState<Scenario>(initial),
    [originId, setOriginId] = useState<string | undefined>(),
    [nearby, setNearby] = useState(false),
    [radius, setRadius] = useState(200),
    [similar, setSimilar] = useState<Similar[]>([]),
    [result, setResult] = useState<Prediction | null>(null),
    [phase, setPhase] = useState(""),
    [error, setError] = useState(""),
    [pdfBusy, setPdfBusy] = useState(false),
    [pdfError, setPdfError] = useState("");
  const worker = useRef<Worker | null>(null),
    analysisId = useRef(0),
    similarId = useRef(0),
    controller = useRef<AbortController | null>(null);
  const eventMap = useMemo(
    () => new Map(events.map((e) => [e.id, e])),
    [events],
  );
  const selected = selectedId ? eventMap.get(selectedId) || null : null;
  useEffect(() => {
    const w = new Worker(new URL("./atlas/atlas.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.postMessage({ type: "init", events, manifest });
    w.onmessage = (e) => {
      const q = e.data;
      if (q.type === "analyze" && q.id === analysisId.current) {
        setBusy(false);
        if (q.error) setWorkerError(q.error);
        else {
          setAnalysis(q.result);
          setWorkerError("");
        }
      }
      if (q.type === "similar" && q.id === similarId.current) {
        if (q.error) setWorkerError(q.error);
        else setSimilar(q.result);
      }
    };
    w.onerror = () => {
      setBusy(false);
      setWorkerError(
        "No se pudo calcular la selección. Recarga el atlas para reintentar.",
      );
    };
    return () => {
      w.terminate();
      worker.current = null;
      controller.current?.abort();
    };
  }, [events, manifest]);
  useEffect(() => {
    setBusy(true);
    setPage(0);
    worker.current?.postMessage({
      type: "analyze",
      id: ++analysisId.current,
      filters,
      segment,
      width,
      layer,
    });
  }, [filters, segment, width, layer]);
  useEffect(() => {
    worker.current?.postMessage({
      type: "similar",
      id: ++similarId.current,
      scenario,
      radius: nearby ? radius : null,
      exclude: originId,
    });
  }, [scenario, nearby, radius, originId]);
  useEffect(() => {
    history.replaceState(null, "", writeUrl(filters, selectedId, layer, view));
  }, [filters, selectedId, layer, view]);
  useEffect(() => {
    const back = () => {
      const state = readUrl(manifest, location.search);
      setFilters(state.filters);
      setLayer(state.layer);
      setSelectedId(state.selected);
      setView(state.view);
      setPlaying(false);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [manifest]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setFilters((f) => {
          const year = (f.year ?? f.start) + 1;
          if (year > f.end) {
            setPlaying(false);
            return f;
          }
          return { ...f, year };
        }),
      speed,
    );
    return () => clearInterval(timer);
  }, [playing, speed]);
  const visible = useMemo(
    () => analysis?.ids.map((id) => eventMap.get(id)!).filter(Boolean) || [],
    [analysis, eventMap],
  );
  const [eventOrder, setEventOrder] =
    useState<import("./atlas/types").EventOrder>("recent");
  const [listFilters, setListFilters] = useState({
    firstMonth: 1,
    lastMonth: 12,
    minMag: 0,
    maxMag: 10,
    minDepth: 0,
    maxDepth: 1000,
  });
  const sorted = useMemo(
    () => orderEvents(filterEventList(visible, listFilters), eventOrder),
    [visible, eventOrder, listFilters],
  );
  useEffect(() => setPage(0), [eventOrder, listFilters]);
  const months = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  const [contextTab, setContextTab] = useState<"events" | "detail">("events");
  const [analysisTab, setAnalysisTab] = useState<
    "depth" | "distributions" | "clusters"
  >("depth");
  const [intro, setIntro] = useState(true),
    [sheet, setSheet] = useState<"closed" | "half" | "full">("closed");
  const [cutFocus, setCutFocus] = useState(false);
  const sheetDrag = useRef<number | null>(null);
  const sheetTrigger = useRef<HTMLButtonElement>(null);
  function closeSheet() {
    setSheet("closed");
    sheetTrigger.current?.focus();
  }
  function navigate(next: import("./atlas/types").View) {
    setPlaying(false);
    setCutFocus(false);
    setView(next);
    closeSheet();
  }
  useEffect(() => {
    setPlaying(false);
  }, [view]);
  useEffect(() => {
    if (sheet === "closed" || !window.matchMedia("(max-width:960px)").matches)
      return;
    document.querySelector<HTMLButtonElement>(".sheet-handle button")?.focus();
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSheet();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [sheet]);
  function toggleSelection(id: string) {
    setSelectedId((current) => (current === id ? null : id));
    setContextTab("detail");
    setSheet("half");
  }
  function change(p: Partial<Filters>) {
    setPlaying(false);
    setFilters((f) => ({
      ...f,
      ...p,
      year:
        p.start !== undefined || p.end !== undefined
          ? null
          : p.year === undefined
            ? f.year
            : p.year,
    }));
  }
  function editScenario(p: Partial<Scenario>) {
    controller.current?.abort();
    setPhase("");
    setError("");
    setResult(null);
    setScenario((s) => ({ ...s, ...p }));
  }
  function useEvent(e: Event) {
    setOriginId(e.id);
    editScenario({
      latitud: e.lat,
      longitud: e.lon,
      profundidad_km: e.depth,
      magnitud: e.mag,
    });
    navigate("simulate");
    setPlaying(false);
  }
  async function evaluate() {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setPhase("Conectando con el modelo…");
    setError("");
    setResult(null);
    try {
      await prepare(c.signal);
      setPhase("Evaluando escenario…");
      const response = await predict(scenario, c.signal);
      if (!c.signal.aborted) setResult(response);
    } catch (e) {
      if (!c.signal.aborted)
        setError(
          e instanceof Error ? e.message : "No se pudo evaluar el escenario.",
        );
    } finally {
      if (!c.signal.aborted) setPhase("");
    }
  }
  async function passport() {
    if (!selected) return;
    setPdfBusy(true);
    setPdfError("");
    try {
      const { downloadPassport } = await import("./atlas/passport");
      await downloadPassport(selected, manifest);
    } catch {
      setPdfError(
        "No se pudo generar el PDF. Comprueba la conexión y reintenta.",
      );
    } finally {
      setPdfBusy(false);
    }
  }
  useEffect(() => {
    if (segment) {
      const panel = document.getElementById(
        "depth-section",
      ) as HTMLDetailsElement | null;
      if (panel) panel.open = true;
    }
  }, [segment]);
  function restore() {
    setPlaying(false);
    setFilters(defaults(manifest));
    setSegment(null);
    setLayer("depth");
    setEventOrder("recent");
    setListFilters({
      firstMonth: 1,
      lastMonth: 12,
      minMag: 0,
      maxMag: 10,
      minDepth: 0,
      maxDepth: 1000,
    });
    setSelectedId(null);
    setReset((r) => r + 1);
  }
  const validScenario =
    Object.values(scenario).every(Number.isFinite) &&
    scenario.latitud >= -90 &&
    scenario.latitud <= 90 &&
    scenario.longitud >= -180 &&
    scenario.longitud <= 180 &&
    scenario.profundidad_km >= 0 &&
    scenario.profundidad_km <= 1000 &&
    scenario.magnitud >= 0 &&
    scenario.magnitud <= 10;
  const requestedPeriod =
    filters.year !== null
      ? String(filters.year)
      : `${filters.start} — ${filters.end}`;
  // Las cifras siempre se etiquetan con el intervalo que produjo el worker,
  // incluso mientras se prepara el siguiente fotograma de la reproducción.
  const period = analysis?.period ?? requestedPeriod;
  return (
    <div className={`app app-${view}`}>
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("explore");
          }}
        >
          <img className="brand-symbol" src="/tecta.svg" alt="" />
          <span>
            TECTA<small>Perú en movimiento.</small>
          </span>
        </a>
        <nav aria-label="Secciones">
          {(
            [
              ["explore", "Explorar"],
              ["analyze", "Analizar"],
              ["simulate", "Simular"],
              ["science", "Ciencia"],
            ] as const
          ).map(([key, label], i) => (
            <button
              key={key}
              aria-current={view === key ? "page" : undefined}
              className={view === key ? "active" : ""}
              onClick={() => navigate(key)}
            >
              <span className="nav-index">0{i + 1}</span>
              {label}
            </button>
          ))}
        </nav>
        <span className="edition">
          <i /> CATÁLOGO HISTÓRICO
        </span>
      </header>
      <main>
        {view === "science" && (
          <section className="science-page">
            <p className="eyebrow">04 / CIENCIA ABIERTA</p>
            <h1>
              La confianza empieza
              <br />
              con datos visibles.
            </h1>
            <p className="science-lead">
              TECTA hace visible lo que ocurre debajo del Perú. Un instrumento
              de exploración histórica y escenarios experimentales, desarrollado
              en el contexto académico de la UNMSM.
            </p>
            <div className="science-grid">
              <article>
                <span>01 / CATÁLOGO</span>
                <h2>Un registro, una fuente.</h2>
                <p>
                  {number(manifest.count)} eventos entre {manifest.minYear} y{" "}
                  {manifest.maxYear}. La base IGP original se conserva; la
                  exportación auditada tiene identificadores estables.
                </p>
                <p>
                  Versión <code>{manifest.version}</code>. La cantidad de
                  registros no implica cobertura comparable entre épocas.
                </p>
              </article>
              <article>
                <span>02 / AUDITORÍA</span>
                <h2>Corregir también es ciencia.</h2>
                <p>
                  {number(manifest.audit.correctedDates)} fechas corregidas,{" "}
                  {number(manifest.audit.changedAssociations)} asociaciones
                  cambiadas y {manifest.audit.issues} casos ambiguos
                  documentados.
                </p>
                <p>
                  Los enlaces USGS son asociaciones automáticas por tiempo y
                  distancia, no verificaciones manuales. Intensidad ausente
                  significa sin información.
                </p>
              </article>
              <article>
                <span>03 / PROFUNDIDAD</span>
                <h2>Mirar por debajo.</h2>
                <p>
                  Magnitud describe el tamaño del evento. Profundidad indica
                  dónde ocurrió bajo la superficie. La intensidad asociada
                  describe efectos reportados; son variables distintas.
                </p>
                <p>
                  Superficial: ≤60 km. Intermedia: &gt;60–300 km. Profunda:
                  &gt;300 km. El corte proyecta eventos de una franja sobre un
                  recorrido A–B; no reconstruye geología.
                </p>
              </article>
              <article>
                <span>04 / PATRONES</span>
                <h2>Grupos, no certezas.</h2>
                <p>
                  K-Means muestra grupos del modelo y escalador existentes.
                  DBSCAN muestra concentraciones espaciales de eventos
                  superficiales; gris identifica dispersos o no aplicables.
                </p>
                <p>
                  Los agrupamientos se preparan sobre el catálogo completo.
                  Filtrar selecciona sus eventos sin recalcular los grupos.
                </p>
              </article>
              <article>
                <span>05 / MODELO</span>
                <h2>Experimental, explícitamente.</h2>
                <p>
                  XGBoost recibe latitud, longitud, magnitud y profundidad. Su
                  clasificación no predice próximos sismos, daños específicos ni
                  tsunamis; TECTA no es una alerta oficial.
                </p>
                <p>
                  La auditoría cambió {manifest.audit.changedTargets} etiquetas.
                  El artefacto fue entrenado con datos anteriores y requiere
                  reentrenamiento y evaluación independiente. Sus probabilidades
                  no tienen calibración verificada.
                </p>
              </article>
              <article>
                <span>06 / FUENTES</span>
                <h2>Trazabilidad antes que promesas.</h2>
                <p>
                  <a
                    href="https://www.igp.gob.pe/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Instituto Geofísico del Perú ↗
                  </a>
                  <br />
                  <a
                    href="https://earthquake.usgs.gov/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    USGS ↗
                  </a>
                </p>
                <p>
                  Cartografía: OpenFreeMap, OpenMapTiles y OpenStreetMap.
                  Contorno y sombreado: Natural Earth, dominio público.
                </p>
                <a href="/data/manifest.json" target="_blank">
                  Consultar manifiesto del catálogo ↗
                </a>
              </article>
            </div>
          </section>
        )}
        <div
          className={`atlas-layout view-${view} analysis-${analysisTab} ${cutFocus ? "cut-focused" : ""}`}
          data-sheet={sheet}
        >
          <aside className="sidebar">
            <details className="panel filters" open={view === "simulate"}>
              <summary>
                {view !== "simulate"
                  ? "Afinar la exploración"
                  : "Construir un escenario"}
              </summary>
              {view !== "simulate" ? (
                <>
                  <RangePair
                    title="Años"
                    min={manifest.minYear}
                    max={manifest.maxYear}
                    values={[filters.start, filters.end]}
                    onChange={(v) => change({ start: v[0], end: v[1] })}
                  />
                  <RangePair
                    title="Magnitud"
                    min={0}
                    max={10}
                    step={0.1}
                    values={[filters.minMag, filters.maxMag]}
                    onChange={(v) => change({ minMag: v[0], maxMag: v[1] })}
                  />
                  <RangePair
                    title="Profundidad"
                    unit="km"
                    min={0}
                    max={1000}
                    values={[filters.minDepth, filters.maxDepth]}
                    onChange={(v) => change({ minDepth: v[0], maxDepth: v[1] })}
                  />
                  <button className="text-button" onClick={restore}>
                    ↺ Restablecer exploración
                  </button>
                </>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (validScenario) void evaluate();
                  }}
                >
                  <div className="coordinate-inputs">
                    {(["latitud", "longitud"] as const).map((key) => (
                      <label key={key}>
                        {key === "latitud" ? "Latitud" : "Longitud"}
                        <input
                          required
                          type="number"
                          step="0.0001"
                          min={key === "latitud" ? -90 : -180}
                          max={key === "latitud" ? 90 : 180}
                          value={
                            Number.isNaN(scenario[key]) ? "" : scenario[key]
                          }
                          onChange={(e) =>
                            editScenario({ [key]: e.target.valueAsNumber })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  {(["magnitud", "profundidad_km"] as const).map((key) => (
                    <label className="slider-field" key={key}>
                      <span>
                        {key === "magnitud" ? "Magnitud" : "Profundidad (km)"}
                        <input
                          required
                          aria-label={
                            key === "magnitud"
                              ? "Magnitud del escenario"
                              : "Profundidad del escenario"
                          }
                          type="number"
                          min={0}
                          max={key === "magnitud" ? 10 : 1000}
                          step={key === "magnitud" ? 0.1 : 1}
                          value={
                            Number.isNaN(scenario[key]) ? "" : scenario[key]
                          }
                          onChange={(e) =>
                            editScenario({ [key]: e.target.valueAsNumber })
                          }
                        />
                      </span>
                      <input
                        aria-label={`Ajustar ${key}`}
                        type="range"
                        min={0}
                        max={key === "magnitud" ? 10 : 1000}
                        step={key === "magnitud" ? 0.1 : 1}
                        value={
                          Number.isFinite(scenario[key]) ? scenario[key] : 0
                        }
                        onChange={(e) =>
                          editScenario({ [key]: e.target.valueAsNumber })
                        }
                      />
                    </label>
                  ))}
                  <button
                    className="primary full"
                    disabled={!!phase || !validScenario}
                  >
                    {phase || "Evaluar escenario →"}
                  </button>
                  <p className="small">
                    Evaluación experimental de la clase del evento.
                  </p>
                  {error && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                </form>
              )}
            </details>
            <div className="panel context-note">
              <span className="eyebrow">
                {view !== "simulate"
                  ? "CADA PUNTO ES UN REGISTRO"
                  : "EL CONTEXTO IMPORTA"}
              </span>
              <p>
                {view !== "simulate"
                  ? "El tamaño representa magnitud; el color, la capa seleccionada. Elige un punto para conocer su historia."
                  : "Las probabilidades describen al modelo. No estiman daños ni intensidad por ciudad."}
              </p>
            </div>
            <details className="panel methodology">
              <summary>Datos y metodología</summary>
              <p>
                Fuente: catálogo IGP y asociaciones automáticas con USGS. Fechas
                en UTC.
              </p>
              <p>
                {number(manifest.audit.correctedDates)} fechas corregidas frente
                al procesamiento anterior; {number(manifest.counts.intensity)}{" "}
                eventos con intensidad asociada.
              </p>
              <p>
                La asociación exige ±15 s, hasta 75 km y coincidencia única. No
                equivale a revisión manual.
              </p>
              <p>
                La cobertura del catálogo varía entre épocas. Más registros no
                implican necesariamente más actividad.
              </p>
              <p>
                K-Means: latitud, longitud y profundidad estandarizadas. DBSCAN:
                eventos ≤60 km, radio 18 km, mínimo 80 muestras; sin dimensión
                temporal.
              </p>
              <p>
                Las capas se calcularon con el catálogo completo: filtrar no
                vuelve a entrenarlas.
              </p>
              <small>Versión {manifest.version}</small>
            </details>
          </aside>
          <section className="workspace">
            {intro && view === "explore" && (
              <div className="map-intro">
                <div>
                  <p className="eyebrow">TECTA / ATLAS DEL SUBSUELO</p>
                  <h1>
                    Lo que ocurre
                    <br />
                    <em>debajo del Perú.</em>
                  </h1>
                </div>
                <button
                  aria-label="Cerrar introducción"
                  onClick={() => setIntro(false)}
                >
                  ×
                </button>
              </div>
            )}
            {view === "analyze" && (
              <div className="analysis-heading">
                <p className="eyebrow">02 / LEER EL TERRITORIO</p>
                <h1>
                  De la superficie
                  <br />a la profundidad.
                </h1>
              </div>
            )}

            <div className="map-topline">
              <span>
                <i className="live-dot" />
                {view !== "simulate"
                  ? `${number(visible.length)} eventos · ${period}`
                  : "Ubica tu evento hipotético"}
              </span>
              <span>
                {busy
                  ? "Actualizando selección…"
                  : filters.bounds
                    ? "Zona seleccionada"
                    : "Vista del catálogo"}
              </span>
            </div>
            <label className="map-layer-picker">
              Colorear mapa por
              <select
                value={layer}
                onChange={(e) => setLayer(e.target.value as Layer)}
              >
                <option value="depth">Profundidad</option>
                <option value="magnitude">Magnitud</option>
                <option value="kmeans">Grupos K-Means</option>
                <option value="dbscan">Concentraciones DBSCAN</option>
              </select>
            </label>
            <Suspense
              fallback={<div className="map-loading">Preparando el mapa…</div>}
            >
              <AtlasMap
                events={view !== "simulate" ? visible : events}
                selected={selected}
                layer={layer}
                bounds={filters.bounds}
                segment={segment}
                scenario={
                  view === "simulate" && validScenario ? scenario : undefined
                }
                reset={reset}
                width={width}
                onViewSection={() => {
                  setView("analyze");
                  setAnalysisTab("depth");
                  if (window.matchMedia("(max-width:960px)").matches)
                    setCutFocus(true);
                  const panel = document.getElementById(
                    "depth-section",
                  ) as HTMLDetailsElement;
                  if (!panel) return;
                  panel.open = true;
                  requestAnimationFrame(() =>
                    panel.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    }),
                  );
                }}
                context={view}
                onSelect={toggleSelection}
                onBounds={(bounds) => change({ bounds })}
                onSegment={(s) => {
                  setSegment(s);
                  if (s) {
                    setView("analyze");
                    setAnalysisTab("depth");
                  }
                }}
                onLocation={
                  view === "simulate"
                    ? ([lon, lat]) =>
                        editScenario({ longitud: lon, latitud: lat })
                    : undefined
                }
              />
            </Suspense>
            {view !== "simulate" && (
              <div className="filter-chips">
                {filters.bounds && (
                  <span>
                    Zona seleccionada{" "}
                    <button
                      onClick={() => {
                        change({ bounds: null });
                        setReset((r) => r + 1);
                      }}
                    >
                      Quitar zona
                    </button>
                  </span>
                )}
                {filters.year !== null && (
                  <span>
                    Solo {filters.year}{" "}
                    <button onClick={() => change({ year: null })}>
                      Ver todo el intervalo
                    </button>
                  </span>
                )}
                {(filters.minMag !== 0 || filters.maxMag !== 10) && (
                  <span>
                    Magnitud {filters.minMag}–{filters.maxMag}
                  </span>
                )}
                {(filters.minDepth !== 0 || filters.maxDepth !== 1000) && (
                  <span>
                    Profundidad {filters.minDepth}–{filters.maxDepth} km
                  </span>
                )}
              </div>
            )}
            {view !== "simulate" && (
              <div className="timeline">
                <button
                  className="play-button"
                  aria-label={
                    playing ? "Pausar historia" : "Reproducir historia"
                  }
                  onClick={() => {
                    if (playing) {
                      setPlaying(false);
                      return;
                    }
                    setFilters((f) => ({
                      ...f,
                      year:
                        f.year === null || f.year >= f.end ? f.start : f.year,
                    }));
                    setPlaying(true);
                  }}
                >
                  {playing ? "Ⅱ" : "▶"}
                </button>
                <div className="timeline-track">
                  <div>
                    <span>PERÚ A TRAVÉS DEL TIEMPO</span>
                    <strong>{requestedPeriod}</strong>
                  </div>
                  <input
                    aria-label="Año de la reproducción"
                    type="range"
                    min={filters.start}
                    max={filters.end}
                    value={filters.year ?? filters.start}
                    onChange={(e) => change({ year: e.target.valueAsNumber })}
                  />
                  <div>
                    <small>{filters.start}</small>
                    <small>{filters.end}</small>
                  </div>
                </div>
                <label className="speed">
                  Velocidad
                  <select
                    aria-label="Velocidad de reproducción"
                    value={speed}
                    onChange={(e) => setSpeed(+e.target.value)}
                  >
                    <option value={2000}>0,5×</option>
                    <option value={1000}>1×</option>
                    <option value={500}>2×</option>
                  </select>
                </label>
                <button
                  className="text-button"
                  onClick={() => change({ year: null })}
                >
                  Todo el intervalo
                </button>
              </div>
            )}
            {workerError && (
              <p className="error" role="alert">
                {workerError}
              </p>
            )}
            {view === "analyze" && (
              <div
                className="analysis-tabs"
                role="tablist"
                aria-label="Análisis"
              >
                {(
                  [
                    ["depth", "Profundidad"],
                    ["distributions", "Distribuciones"],
                    ["clusters", "Agrupamientos"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    role="tab"
                    aria-selected={analysisTab === key}
                    key={key}
                    onClick={() => {
                      setAnalysisTab(key);
                      if (
                        key === "clusters" &&
                        layer !== "kmeans" &&
                        layer !== "dbscan"
                      )
                        setLayer("kmeans");
                    }}
                  >
                    {label}
                  </button>
                ))}
                <button
                  className="return-map"
                  onClick={() => navigate("explore")}
                >
                  Volver al mapa ↗
                </button>
              </div>
            )}
            {view === "simulate" && (
              <section className="lab-results panel">
                <div>
                  <p className="eyebrow">
                    CLASIFICACIÓN ESTIMADA POR EL MODELO
                  </p>
                  <h2>{result?.nivel_impacto || "Explora una posibilidad"}</h2>
                  <p>
                    {result
                      ? "Distribución de probabilidades del clasificador."
                      : "Pulsa Evaluar escenario para consultar XGBoost. Los eventos similares se exploran sin conexión con la API."}
                  </p>
                </div>
                {result && (
                  <div className="probability-list">
                    {Object.entries(result.probabilidades).map(
                      ([name, value]) => (
                        <div key={name}>
                          <span>
                            {name}
                            <strong>{(value * 100).toFixed(1)} %</strong>
                          </span>
                          <progress value={value} max={1} />
                        </div>
                      ),
                    )}
                  </div>
                )}
                <p className="model-note">
                  Modelo experimental: entrenado con el catálogo anterior. La
                  auditoría cambió {manifest.audit.changedTargets} etiquetas;
                  requiere reentrenamiento y evaluación independiente.
                </p>
                {result && (
                  <details>
                    <summary>¿Cómo se obtuvo este resultado?</summary>
                    <p>
                      Variables enviadas: latitud {scenario.latitud}, longitud{" "}
                      {scenario.longitud}, M {scenario.magnitud}, profundidad{" "}
                      {scenario.profundidad_km} km. No se dispone de
                      contribuciones individuales de variables.
                    </p>
                    <p>
                      Catálogo actual: {manifest.version}. El modelo corresponde
                      al entrenamiento anterior; ambas versiones no certifican
                      compatibilidad.
                    </p>
                    <p>
                      Modelo {result.nombre_modelo} ·{" "}
                      {result.version_modelo.slice(0, 12)}
                    </p>
                    {result.advertencias.map((w) => (
                      <p key={w}>{w}</p>
                    ))}
                  </details>
                )}
              </section>
            )}
            {view === "simulate" && (
              <section className="panel similar-panel">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">UN PUENTE CON EL PASADO</p>
                    <h2>Sismos parecidos al tuyo</h2>
                  </div>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={nearby}
                      onChange={(e) => setNearby(e.target.checked)}
                    />
                    Solo cercanos
                  </label>
                </div>
                <p className="small">
                  Los cinco más próximos en magnitud y profundidad
                  estandarizadas, en todo el catálogo. La distancia geográfica
                  se muestra aparte.
                </p>
                {nearby && (
                  <label className="slider-field">
                    Radio: {radius} km
                    <input
                      aria-label="Radio de búsqueda"
                      type="range"
                      min={50}
                      max={1000}
                      step={50}
                      value={radius}
                      onChange={(e) => setRadius(+e.target.value)}
                    />
                  </label>
                )}
                {!validScenario ? (
                  <p>
                    Introduce parámetros válidos para buscar eventos similares.
                  </p>
                ) : similar.length ? (
                  similar.map((s) => (
                    <div className="similar-row" key={s.event.id}>
                      <EventCard
                        event={s.event}
                        active={selectedId === s.event.id}
                        onSelect={() => toggleSelection(s.event.id)}
                      />
                      <p>
                        Δ magnitud {s.deltaMag >= 0 ? "+" : ""}
                        {s.deltaMag.toFixed(1)} · Δ profundidad{" "}
                        {s.deltaDepth >= 0 ? "+" : ""}
                        {s.deltaDepth.toFixed(0)} km · a{" "}
                        {number(Math.round(s.distance))} km
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="empty">
                    No hay eventos dentro de este radio. Puedes ampliarlo.
                  </p>
                )}
              </section>
            )}
            {view === "analyze" && analysis && (
              <section className="panel radiography">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">
                      RADIOGRAFÍA{" "}
                      {filters.bounds ? "DE TU ZONA" : "DE LA SELECCIÓN"}
                    </p>
                    <h2>Leer el territorio</h2>
                  </div>
                  {filters.bounds && (
                    <button onClick={() => change({ bounds: null })}>
                      Quitar zona
                    </button>
                  )}
                </div>
                <div className="metrics">
                  <div>
                    <strong>{number(analysis.summary.count)}</strong>
                    <span>registros · {period}</span>
                  </div>
                  <div>
                    <strong>
                      {analysis.summary.maxMag?.toFixed(1) ?? "—"}
                    </strong>
                    <span>mayor magnitud</span>
                  </div>
                  <div>
                    <strong>
                      {analysis.summary.medianDepth?.toFixed(0) ?? "—"}
                      <small> km</small>
                    </strong>
                    <span>profundidad mediana</span>
                  </div>
                </div>
                {visible.length ? (
                  <Suspense fallback={<p>Preparando gráficos…</p>}>
                    <Charts
                      layer={layer}
                      analysis={analysis}
                      section={false}
                      selected={selectedId}
                      onSelect={toggleSelection}
                    />
                  </Suspense>
                ) : (
                  <p className="empty">
                    No hay eventos con estos filtros. Amplía el intervalo o
                    restablece la exploración.
                    {filters.bounds && (
                      <button
                        onClick={() => {
                          change({ bounds: null });
                          setReset((r) => r + 1);
                        }}
                      >
                        Quitar zona
                      </button>
                    )}
                    {filters.year !== null && (
                      <button onClick={() => change({ year: null })}>
                        Ver todo el intervalo
                      </button>
                    )}
                  </p>
                )}
                {(layer === "kmeans" || layer === "dbscan") && (
                  <div className="group-cards">
                    {analysis.groups.map((g) => (
                      <div key={g.id}>
                        <i style={{ background: palette[g.id] || "#a8b3ae" }} />
                        <strong>
                          {g.id < 0 ? "Dispersos" : `Grupo ${g.id}`}
                        </strong>
                        <span>
                          {number(g.count)} eventos · {g.meanDepth.toFixed(0)}{" "}
                          km de profundidad media · M máx. {g.maxMagnitude}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            <details
              id="depth-section"
              className="panel section-panel"
              open={view === "analyze"}
            >
              <summary>Perú por dentro · corte de profundidad</summary>
              <p className="small">
                Traza dos puntos en el mapa o usa un corte de ejemplo. Se
                muestran los eventos de los filtros actuales dentro de la
                franja, entre ambos extremos. El eje horizontal indica
                kilómetros desde A; el vertical muestra profundidad en km,
                creciente hacia abajo. Un ancho de 100 km recoge eventos hasta
                50 km a cada lado. Cada punto es un sismo; selecciónalo para
                consultar su ficha. Este corte muestra ubicaciones históricas de
                sismos, no un modelo de las capas geológicas.
              </p>
              <button
                className="cut-focus-button"
                onClick={() => setCutFocus(!cutFocus)}
              >
                {cutFocus ? "Volver al mapa" : "Ver corte en pantalla"}
              </button>
              <button
                onClick={() =>
                  setSegment([
                    [-79, -12],
                    [-70, -12],
                  ])
                }
              >
                Usar corte oeste–este a 12° S
              </button>
              {segment && (
                <>
                  <label className="slider-field">
                    Ancho total de la franja: {width} km
                    <input
                      type="range"
                      aria-label="Ancho de la franja"
                      min={20}
                      max={300}
                      step={10}
                      value={width}
                      onChange={(e) => setWidth(+e.target.value)}
                    />
                  </label>
                  <details className="cut-coordinates">
                    <summary>Ajustar extremos A/B</summary>
                    <div className="coordinate-inputs">
                      {segment.map((p, i) => (
                        <fieldset key={i}>
                          <legend>{i ? "Final" : "Inicio"}</legend>
                          {p.map((v, j) => (
                            <label key={j}>
                              {j ? "Latitud" : "Longitud"}
                              <input
                                type="number"
                                aria-label={`${i ? "Final" : "Inicio"} ${j ? "latitud" : "longitud"}`}
                                min={j ? -90 : -180}
                                max={j ? 90 : 180}
                                step={0.1}
                                value={v}
                                onChange={(e) => {
                                  const n = e.target.valueAsNumber;
                                  if (
                                    !Number.isFinite(n) ||
                                    Math.abs(n) > (j ? 90 : 180)
                                  )
                                    return;
                                  const s: Segment = [
                                    [...segment[0]],
                                    [...segment[1]],
                                  ];
                                  s[i][j] = n;
                                  setSegment(s);
                                }}
                              />
                            </label>
                          ))}
                        </fieldset>
                      ))}
                    </div>
                  </details>
                  {analysis && (
                    <>
                      <p className="small">
                        {number(analysis.section.length)} eventos · recorrido{" "}
                        {analysis.sectionLength.toFixed(0)} km · profundidad
                        hacia abajo
                      </p>
                      <Suspense fallback={<p>Preparando corte…</p>}>
                        <Charts
                          layer={layer}
                          analysis={analysis}
                          section
                          selected={selectedId}
                          onSelect={toggleSelection}
                        />
                      </Suspense>
                      {analysis.section.length === 0 && (
                        <p className="empty">
                          No hay eventos dentro del corte y los filtros
                          actuales.
                        </p>
                      )}
                    </>
                  )}
                  <button
                    className="text-button"
                    onClick={() => setSegment(null)}
                  >
                    Quitar corte
                  </button>
                </>
              )}
            </details>
            {view !== "simulate" && (
              <details className="panel area-access">
                <summary>Seleccionar zona por coordenadas</summary>
                <p className="small">Alternativa al dibujo sobre el mapa.</p>
                <AreaForm onApply={(bounds) => change({ bounds })} />
              </details>
            )}
          </section>
          <button
            className="sheet-trigger"
            ref={sheetTrigger}
            onClick={() => setSheet("half")}
          >
            Eventos · {number(visible.length)} /{" "}
            {selected ? "Ficha seleccionada" : "Abrir panel"}
          </button>
          <aside
            className="event-sidebar"
            data-tab={contextTab}
            aria-label="Eventos y ficha"
          >
            <div
              className="sheet-handle"
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                sheetDrag.current = e.clientY;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerUp={(e) => {
                if (sheetDrag.current !== null) {
                  const delta = e.clientY - sheetDrag.current;
                  if (delta > 60) closeSheet();
                  else if (delta < -60) setSheet("full");
                  sheetDrag.current = null;
                }
              }}
            >
              <span />
              <button
                onClick={() => setSheet(sheet === "full" ? "half" : "full")}
              >
                {sheet === "full" ? "Reducir panel" : "Expandir panel"}
              </button>
              <button onClick={closeSheet}>Cerrar panel</button>
            </div>
            <div className="context-tabs">
              <button
                aria-pressed={contextTab === "events"}
                onClick={() => setContextTab("events")}
              >
                Eventos <small>{number(sorted.length)}</small>
              </button>
              <button
                aria-pressed={contextTab === "detail"}
                onClick={() => setContextTab("detail")}
              >
                Ficha {selected && <i />}
              </button>
            </div>
            <details className="panel event-detail" open>
              <summary>Pasaporte del evento</summary>
              {selected ? (
                <>
                  <button
                    className="clear-selection"
                    onClick={() => setSelectedId(null)}
                  >
                    × Quitar selección
                  </button>
                  <div className="event-big">
                    {selected.mag.toFixed(1)}
                    <span>M</span>
                  </div>
                  <h2>{selected.place || "Evento del catálogo IGP"}</h2>
                  <p>{dateLabel(selected.date)}</p>
                  {view !== "simulate" &&
                    !analysis?.ids.includes(selected.id) && (
                      <p className="notice">
                        Este evento está fuera de los filtros actuales.
                      </p>
                    )}
                  <p className="event-depth">
                    {selected.depth} <span>km de profundidad</span>
                    <small>
                      {selected.depth <= 60
                        ? "Superficial"
                        : selected.depth <= 300
                          ? "Intermedia"
                          : "Profunda"}
                    </small>
                  </p>
                  <details className="scientific-details">
                    <summary>Detalles científicos y fuente</summary>
                    <dl>
                      <dt>Coordenadas</dt>
                      <dd>
                        {selected.lat.toFixed(4)}, {selected.lon.toFixed(4)}
                      </dd>
                      <dt>Profundidad</dt>
                      <dd>{selected.depth} km</dd>
                      <dt>K-Means</dt>
                      <dd>Grupo {selected.kmeans}</dd>
                      <dt>DBSCAN</dt>
                      <dd>
                        {selected.dbscan === null
                          ? "No aplicable (>60 km)"
                          : selected.dbscan < 0
                            ? "Disperso"
                            : `Concentración ${selected.dbscan}`}
                      </dd>
                      <dt>Intensidad asociada</dt>
                      <dd>
                        {selected.intensity === null
                          ? "Sin información"
                          : `${selected.intensity} · ${selected.intensitySource}`}
                      </dd>
                    </dl>
                    <p className="small">
                      {selected.usgs
                        ? "Asociación automática con USGS; no verificación manual."
                        : "Sin asociación USGS publicada."}
                    </p>
                    {selected.usgs && (
                      <a
                        className="source-link"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(selected.usgs)}`}
                      >
                        Consultar fuente USGS ↗
                      </a>
                    )}
                  </details>
                  <button
                    className="primary full"
                    onClick={() => useEvent(selected)}
                  >
                    Explorar este escenario →
                  </button>
                  <button
                    className="full"
                    disabled={pdfBusy}
                    onClick={() => void passport()}
                  >
                    {pdfBusy
                      ? "Preparando pasaporte…"
                      : "↓ Descargar pasaporte PDF"}
                  </button>
                  {pdfError && (
                    <p role="alert" className="error">
                      {pdfError}
                    </p>
                  )}
                  <small className="event-id">{selected.id}</small>
                </>
              ) : (
                <div className="empty-passport">
                  <span>◎</span>
                  <h3>Cada evento tiene una historia</h3>
                  <p>Selecciona un punto o un registro para descubrirla.</p>
                </div>
              )}
            </details>
            <details className="panel event-list" open>
              <summary>Eventos de la selección</summary>
              <div className="section-title">
                <span>Catálogo filtrado</span>
                <span>{number(sorted.length)}</span>
              </div>
              <p className="small">
                Eventos de los filtros activos · fechas UTC
              </p>
              <details className="list-filters">
                <summary>Filtrar meses, magnitud y profundidad</summary>
                <p className="small">
                  Estos filtros cambian solo esta lista.{" "}
                  {filters.year !== null
                    ? `Año ${filters.year}.`
                    : "Los meses se aplican a cada año del intervalo global."}
                </p>
                <fieldset className="month-range">
                  <legend>
                    Meses: {months[listFilters.firstMonth - 1]} —{" "}
                    {months[listFilters.lastMonth - 1]}
                  </legend>
                  <label>
                    Desde {months[listFilters.firstMonth - 1]}
                    <input
                      type="range"
                      aria-label="Mes inicial de la lista"
                      min={1}
                      max={12}
                      step={1}
                      value={listFilters.firstMonth}
                      onChange={(e) => {
                        const n = +e.target.value;
                        setListFilters((f) => ({
                          ...f,
                          firstMonth: n,
                          lastMonth: Math.max(n, f.lastMonth),
                        }));
                      }}
                    />
                  </label>
                  <label>
                    Hasta {months[listFilters.lastMonth - 1]}
                    <input
                      type="range"
                      aria-label="Mes final de la lista"
                      min={1}
                      max={12}
                      step={1}
                      value={listFilters.lastMonth}
                      onChange={(e) => {
                        const n = +e.target.value;
                        setListFilters((f) => ({
                          ...f,
                          lastMonth: n,
                          firstMonth: Math.min(n, f.firstMonth),
                        }));
                      }}
                    />
                  </label>
                  <div className="month-ticks" aria-hidden="true">
                    {months.map((month) => (
                      <span key={month}>{month}</span>
                    ))}
                  </div>
                </fieldset>
                <details>
                  <summary>Magnitud y profundidad de la lista</summary>
                  <RangePair
                    title="Magnitud de la lista"
                    min={0}
                    max={10}
                    step={0.1}
                    values={[listFilters.minMag, listFilters.maxMag]}
                    onChange={(v) =>
                      setListFilters((f) => ({
                        ...f,
                        minMag: v[0],
                        maxMag: v[1],
                      }))
                    }
                  />
                  <RangePair
                    title="Profundidad de la lista"
                    min={0}
                    max={1000}
                    values={[listFilters.minDepth, listFilters.maxDepth]}
                    onChange={(v) =>
                      setListFilters((f) => ({
                        ...f,
                        minDepth: v[0],
                        maxDepth: v[1],
                      }))
                    }
                    unit="km"
                  />
                </details>
                <button
                  className="text-button"
                  onClick={() =>
                    setListFilters({
                      firstMonth: 1,
                      lastMonth: 12,
                      minMag: 0,
                      maxMag: 10,
                      minDepth: 0,
                      maxDepth: 1000,
                    })
                  }
                >
                  Restablecer filtros de la lista
                </button>
                <p className="small">
                  {number(sorted.length)} de {number(visible.length)} eventos de
                  la selección global
                </p>
              </details>
              <label className="event-order">
                Ordenar eventos
                <select
                  value={eventOrder}
                  onChange={(e) =>
                    setEventOrder(
                      e.target.value as import("./atlas/types").EventOrder,
                    )
                  }
                >
                  <option value="recent">Fecha: más recientes primero</option>
                  <option value="oldest">Fecha: más antiguos primero</option>
                  <option value="magnitude-desc">
                    Magnitud: mayor a menor
                  </option>
                  <option value="magnitude-asc">Magnitud: menor a mayor</option>
                  <option value="depth-asc">
                    Profundidad: superficial a profundo
                  </option>
                  <option value="depth-desc">
                    Profundidad: profundo a superficial
                  </option>
                </select>
              </label>
              {sorted.slice(page * 20, (page + 1) * 20).map((e) => (
                <EventCard
                  key={e.id}
                  event={e}
                  active={selectedId === e.id}
                  onSelect={() => toggleSelection(e.id)}
                />
              ))}
              {sorted.length === 0 && <p className="empty">Sin resultados.</p>}
              <div className="pagination">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Página anterior"
                >
                  ←
                </button>
                <span>
                  {page + 1} / {Math.max(1, Math.ceil(sorted.length / 20))}
                </span>
                <button
                  disabled={(page + 1) * 20 >= sorted.length}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Página siguiente"
                >
                  →
                </button>
              </div>
            </details>
          </aside>
        </div>
      </main>
      <footer>
        <span>TECTA · Perú en movimiento · UNMSM</span>
        <span>IGP / USGS · Cartografía OpenFreeMap & Natural Earth</span>
        <span>Catálogo {manifest.version}</span>
      </footer>
    </div>
  );
}
function AreaForm({ onApply }: { onApply: (b: Bounds) => void }) {
  const [b, setB] = useState<Bounds>([-79, -14, -74, -9]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (b.every(Number.isFinite) && b[0] < b[2] && b[1] < b[3]) onApply(b);
      }}
    >
      <div className="coordinate-inputs">
        {["Oeste", "Sur", "Este", "Norte"].map((label, i) => (
          <label key={label}>
            {label}
            <input
              required
              aria-label={`Zona ${label}`}
              type="number"
              min={i % 2 ? -90 : -180}
              max={i % 2 ? 90 : 180}
              step={0.1}
              value={b[i]}
              onChange={(e) => {
                const next = [...b] as Bounds;
                next[i] = e.target.valueAsNumber;
                setB(next);
              }}
            />
          </label>
        ))}
      </div>
      <button
        disabled={!b.every(Number.isFinite) || b[0] >= b[2] || b[1] >= b[3]}
      >
        Aplicar zona
      </button>
    </form>
  );
}

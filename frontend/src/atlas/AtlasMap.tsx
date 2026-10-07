import { useEffect, useRef, useState } from "react";
import {
  Map,
  Marker,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Event, Layer, Bounds, Segment, Point, Scenario } from "./types";
import { sectionGeometry, haversine } from "./engine";
import { palette, magnitudeBands } from "./types";
setWorkerUrl(workerUrl);
export const localStyle: StyleSpecification = {
  version: 8,
  sources: {
    peru: {
      type: "geojson",
      data: "/data/peru.geojson",
      attribution: "Natural Earth · dominio público",
    },
  },
  layers: [
    { id: "sea", type: "background", paint: { "background-color": "#080B0F" } },
    {
      id: "peru-fill",
      type: "fill",
      source: "peru",
      paint: { "fill-color": "#182d33" },
    },
    {
      id: "peru-line",
      type: "line",
      source: "peru",
      paint: { "line-color": "#537b7d", "line-width": 1.3 },
    },
  ],
};
export const mapStyle = "/data/map-style-tecta.json";
type Props = {
  events: Event[];
  selected: Event | null;
  layer: Layer;
  bounds: Bounds | null;
  segment: Segment | null;
  scenario?: Scenario;
  reset: number;
  context: string;
  width: number;
  onViewSection: () => void;
  onSelect: (id: string) => void;
  onBounds: (b: Bounds | null) => void;
  onSegment: (s: Segment | null) => void;
  onLocation?: (p: Point) => void;
};
const empty = () => ({ type: "FeatureCollection" as const, features: [] });
export default function AtlasMap(props: Props) {
  const container = useRef<HTMLDivElement>(null),
    mapRef = useRef<Map | null>(null),
    latest = useRef(props),
    toolRef = useRef<"browse" | "box" | "section" | "location">("browse"),
    first = useRef<Point | null>(null),
    lastEvents = useRef<Event[] | null>(null),
    endpoints = useRef<Marker[]>([]),
    pulse = useRef<number | null>(null),
    scenarioMarker = useRef<Marker | null>(null);
  const [tool, setTool] = useState(toolRef.current),
    [notice, setNotice] = useState(""),
    [drawingNotice, setDrawingNotice] = useState(""),
    [failed, setFailed] = useState(false),
    [ready, setReady] = useState(false);
  latest.current = props;
  function choose(t: typeof tool) {
    toolRef.current = t;
    setTool(t);
    first.current = null;
    setDrawingNotice(
      t === "box"
        ? "Selecciona la primera esquina."
        : t === "section"
          ? "Marca el inicio del corte."
          : t === "location"
            ? "Selecciona la ubicación del escenario."
            : "",
    );
    draw();
    mapRef.current
      ?.getCanvas()
      .style.setProperty("cursor", t === "browse" ? "grab" : "crosshair");
  }
  const sync = () => {
    const map = mapRef.current;
    if (!map?.getSource("events")) return;
    const p = latest.current;
    if (lastEvents.current !== p.events) {
      lastEvents.current = p.events;
      (map.getSource("events") as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: p.events.map((e) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [e.lon, e.lat] },
          properties: {
            id: e.id,
            mag: e.mag,
            depth: e.depth,
            kmeans: e.kmeans,
            dbscan: e.dbscan ?? -2,
          },
        })),
      });
    }
    const color =
      p.layer === "depth"
        ? [
            "case",
            ["<=", ["get", "depth"], 60],
            "#38BFA7",
            ["<=", ["get", "depth"], 300],
            "#D9AA5A",
            "#AF9DE1",
          ]
        : p.layer === "magnitude"
          ? [
              "step",
              ["get", "mag"],
              ...magnitudeBands.flatMap((band, i) =>
                i === 0
                  ? [band.color]
                  : [magnitudeBands[i - 1].max, band.color],
              ),
            ]
          : [
              "match",
              ["get", p.layer],
              ...palette.flatMap((c, i) => [i, c]),
              "#82949B",
            ];
    map.setPaintProperty("events-dots", "circle-color", color as never);
    const features: GeoJSON.Feature[] = [];
    if (p.bounds) {
      const [w, s, e, n] = p.bounds;
      features.push({
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [w, s],
              [e, s],
              [e, n],
              [w, n],
              [w, s],
            ],
          ],
        },
      });
    }
    endpoints.current.forEach((marker) => marker.remove());
    endpoints.current = [];
    if (p.segment) {
      p.segment.forEach((point, i) => {
        const label = document.createElement("span");
        label.className = "section-endpoint";
        label.textContent = i ? "B" : "A";
        endpoints.current.push(
          new Marker({ element: label }).setLngLat(point).addTo(map),
        );
      });
      const shape = sectionGeometry(p.segment, p.width);
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [shape.polygon] },
      });
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: shape.centre },
      });
      p.segment.forEach((point, i) =>
        features.push({
          type: "Feature",
          properties: { label: i ? "B" : "A" },
          geometry: { type: "Point", coordinates: point },
        }),
      );
    }
    (map.getSource("selection-shape") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features,
    });
    const markers: GeoJSON.Feature[] = [];
    if (p.selected)
      markers.push({
        type: "Feature",
        properties: { kind: "event" },
        geometry: {
          type: "Point",
          coordinates: [p.selected.lon, p.selected.lat],
        },
      });
    scenarioMarker.current?.remove();
    scenarioMarker.current = null;
    if (p.scenario) {
      const el = document.createElement("div");
      el.className = "scenario-marker";
      el.setAttribute("aria-label", "Ubicación del escenario");
      scenarioMarker.current = new Marker({ element: el })
        .setLngLat([p.scenario.longitud, p.scenario.latitud])
        .addTo(map);
    }
    (map.getSource("selected-point") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: markers,
    });
  };
  function draw(pointer?: Point) {
    const source = mapRef.current?.getSource("draft") as
      GeoJSONSource | undefined;
    if (!source) return;
    const features: GeoJSON.Feature[] = [];
    const a = first.current;
    if (a) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: a },
      });
      if (pointer) {
        const coordinates =
          toolRef.current === "box"
            ? [a, [pointer[0], a[1]], pointer, [a[0], pointer[1]], a]
            : sectionGeometry([a, pointer], latest.current.width).centre;
        features.push({
          type: "Feature",
          properties: {},
          geometry:
            toolRef.current === "box"
              ? { type: "Polygon", coordinates: [coordinates] }
              : { type: "LineString", coordinates },
        });
      }
    }
    source.setData({ type: "FeatureCollection", features });
  }
  function framePeru() {
    choose("browse");
    mapRef.current?.fitBounds(
      [
        [-83, -19],
        [-67, -0.2],
      ],
      { padding: 35, duration: 400 },
    );
  }
  useEffect(() => {
    let map: Map;
    try {
      map = new Map({
        container: container.current!,
        style: localStyle,
        center: [-75, -10],
        zoom: 4.2,
        maxZoom: 14,
        minZoom: 2,
        renderWorldCopies: false,
      });
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
    map.fitBounds(
      [
        [-83, -19],
        [-67, -0.2],
      ],
      { padding: 35, duration: 0 },
    );
    const add = () => {
      if (map.getSource("events")) return;
      lastEvents.current = null;
      if (!map.getSource("tecta-peru")) {
        map.addSource("tecta-peru", {
          type: "geojson",
          data: "/data/peru.geojson",
          attribution: "Natural Earth · dominio público",
        });
        map.addLayer({
          id: "tecta-territory",
          type: "fill",
          source: "tecta-peru",
          paint: { "fill-color": "#38BFA7", "fill-opacity": 0.035 },
        });
        map.addLayer({
          id: "tecta-coast",
          type: "line",
          source: "tecta-peru",
          paint: {
            "line-color": "#568c88",
            "line-width": 1,
            "line-opacity": 0.65,
          },
        });
      }
      for (const id of ["events", "selection-shape", "selected-point", "draft"])
        map.addSource(id, { type: "geojson", data: empty() });
      map.addLayer({
        id: "events-dots",
        type: "circle",
        source: "events",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "mag"],
            3,
            1.3,
            6,
            3.5,
            9,
            9,
          ],
          "circle-color": "#38BFA7",
          "circle-opacity": 0.43,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 0.12,
        },
      });
      map.addLayer({
        id: "shape-fill",
        type: "fill",
        source: "selection-shape",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#38BFA7", "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: "shape-line",
        type: "line",
        source: "selection-shape",
        paint: {
          "line-color": "#E9672B",
          "line-width": 2,
          "line-dasharray": [3, 2],
        },
      });
      map.addLayer({
        id: "selected-ring",
        type: "circle",
        source: "selected-point",
        paint: {
          "circle-radius": 10,
          "circle-color": "#080B0F",
          "circle-opacity": 0.7,
          "circle-stroke-color": [
            "match",
            ["get", "kind"],
            "scenario",
            "#E9672B",
            "#E9672B",
          ],
          "circle-stroke-width": 3,
        },
      });
      map.addLayer({
        id: "draft-fill",
        type: "fill",
        source: "draft",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#E9672B", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "draft-line",
        type: "line",
        source: "draft",
        paint: {
          "line-color": "#E9672B",
          "line-width": 2,
          "line-dasharray": [2, 2],
        },
      });
      map.addLayer({
        id: "draft-point",
        type: "circle",
        source: "draft",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 6,
          "circle-color": "#E9672B",
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "section-ends",
        type: "circle",
        source: "selection-shape",
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 9, "circle-color": "#38BFA7" },
      });
      draw();
      setReady(true);
      sync();
    };
    map.on("style.load", add);
    map.on("click", (e) => {
      const p: Point = [+e.lngLat.lng.toFixed(4), +e.lngLat.lat.toFixed(4)],
        t = toolRef.current;
      if (t === "location") {
        latest.current.onLocation?.(p);
        choose("browse");
        return;
      }
      if (t === "box" || t === "section") {
        if (!first.current) {
          first.current = p;
          setDrawingNotice(
            t === "box"
              ? "Selecciona la esquina opuesta."
              : "Marca el final del corte.",
          );
          draw();
          return;
        }
        const a = first.current;
        if (
          (t === "box" && (a[0] === p[0] || a[1] === p[1])) ||
          (t === "section" && haversine(a, p) < 0.01)
        ) {
          setDrawingNotice(
            "El dibujo no tiene tamaño. Elige un segundo punto distinto.",
          );
          return;
        }
        if (t === "box") {
          if (a[0] !== p[0] && a[1] !== p[1])
            latest.current.onBounds([
              Math.min(a[0], p[0]),
              Math.min(a[1], p[1]),
              Math.max(a[0], p[0]),
              Math.max(a[1], p[1]),
            ]);
        } else if (a[0] !== p[0] || a[1] !== p[1])
          latest.current.onSegment([a, p]);
        choose("browse");
        setDrawingNotice(
          t === "section"
            ? "Corte creado. Consulta el gráfico con Ver resultado."
            : "Zona aplicada. Puedes quitarla desde Quitar zona.",
        );
        return;
      }
      const features = map.queryRenderedFeatures(e.point, {
        layers: map.getLayer("events-dots") ? ["events-dots"] : [],
      });
      const id = features[0]?.properties?.id;
      if (id) latest.current.onSelect(id);
    });
    map.on("mousemove", (e) => {
      if (first.current) draw([e.lngLat.lng, e.lngLat.lat]);
    });
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        choose("browse");
      }
    };
    window.addEventListener("keydown", escape);
    const abort = new AbortController();
    fetch(mapStyle, {
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]),
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((style) => {
        if (!abort.signal.aborted) map.setStyle(style);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setNotice("Cartografía local de respaldo · Natural Earth");
      });
    map.on("error", () =>
      setNotice(
        "Parte de la cartografía no está disponible. Puedes usar el mapa local.",
      ),
    );
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current!);
    return () => {
      abort.abort();
      observer.disconnect();
      window.removeEventListener("keydown", escape);
      endpoints.current.forEach((marker) => marker.remove());
      if (pulse.current !== null) cancelAnimationFrame(pulse.current);
      scenarioMarker.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);
  useEffect(() => {
    sync();
  }, [
    props.events,
    props.selected,
    props.layer,
    props.bounds,
    props.segment,
    props.width,
    props.scenario,
    ready,
  ]);
  useEffect(() => {
    framePeru();
  }, [props.reset]);
  useEffect(() => {
    choose("browse");
  }, [props.context]);
  useEffect(() => {
    if (pulse.current !== null) cancelAnimationFrame(pulse.current);
    const map = mapRef.current;
    if (!map?.getLayer("selected-ring")) return;
    map.setPaintProperty("selected-ring", "circle-radius", 10);
    if (
      !props.selected ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const start = performance.now();
    function frame(now: number) {
      if (!map?.getLayer("selected-ring")) return;
      const t = Math.min(1, (now - start) / 450);
      map.setPaintProperty(
        "selected-ring",
        "circle-radius",
        10 + 8 * Math.sin(Math.PI * t),
      );
      if (t < 1) pulse.current = requestAnimationFrame(frame);
    }
    pulse.current = requestAnimationFrame(frame);
    return () => {
      if (pulse.current !== null) cancelAnimationFrame(pulse.current);
    };
  }, [props.selected?.id, ready]);
  return (
    <div className="map-shell">
      <div
        className="map-canvas"
        ref={container}
        aria-label="Mapa interactivo de eventos sísmicos de Perú"
      />
      {failed && (
        <div className="map-failure">
          <h3>La vista cartográfica necesita WebGL</h3>
          <p>Puedes explorar los eventos, gráficos y fichas desde la lista.</p>
        </div>
      )}
      <div className="map-controls">
        <div className="map-tools">
          <button onClick={framePeru}>Ver Perú completo</button>
          <button
            aria-pressed={tool === "box"}
            className={tool === "box" ? "active" : ""}
            onClick={() => {
              choose(tool === "box" ? "browse" : "box");
            }}
          >
            ▧ Seleccionar zona
          </button>
          <button
            aria-pressed={tool === "section"}
            className={tool === "section" ? "active" : ""}
            onClick={() => {
              choose(tool === "section" ? "browse" : "section");
            }}
          >
            ╱ Corte de profundidad
          </button>
          {props.onLocation && (
            <button
              className={tool === "location" ? "active" : ""}
              onClick={() => {
                choose(tool === "location" ? "browse" : "location");
              }}
            >
              ◎ Ubicar escenario
            </button>
          )}
        </div>
        <div className="map-selections">
          {props.bounds && (
            <span>
              Zona activa{" "}
              <button
                onClick={() => {
                  latest.current.onBounds(null);
                  framePeru();
                }}
              >
                Quitar zona
              </button>
            </span>
          )}
          {props.segment && (
            <span>
              Corte activo · A → B{" "}
              <button onClick={props.onViewSection}>Ver resultado</button>
              <button
                onClick={() => {
                  choose("browse");
                  props.onSegment(null);
                }}
              >
                Quitar corte
              </button>
            </span>
          )}
        </div>
        {drawingNotice && (
          <div className="drawing-notice" role="status">
            {drawingNotice}{" "}
            {tool !== "browse" && (
              <button onClick={() => choose("browse")}>Cancelar</button>
            )}
          </div>
        )}
      </div>
      {notice && (
        <div className="map-notice" role="status">
          {notice}{" "}
          <button
            onClick={() => {
              mapRef.current?.setStyle(localStyle);
              setNotice("Mapa local · Natural Earth");
            }}
          >
            Mapa local
          </button>
        </div>
      )}
      <div className="map-caption">
        <span>OCÉANO PACÍFICO</span>
        <strong>PERÚ</strong>
      </div>
      <div className="map-key">
        {props.layer === "depth" ? (
          <>
            <span>
              <i style={{ background: "#38BFA7" }} />
              ≤60 km
            </span>
            <span>
              <i style={{ background: "#D9AA5A" }} />
              60–300 km
            </span>
            <span>
              <i style={{ background: "#AF9DE1" }} />
              &gt;300 km
            </span>
          </>
        ) : props.layer === "magnitude" ? (
          magnitudeBands.map((band) => (
            <span key={band.label}>
              <i style={{ background: band.color }} />
              {band.label}
            </span>
          ))
        ) : (
          <span>
            {props.layer === "kmeans"
              ? "Color = grupo K-Means"
              : "Color = concentración · gris = disperso/no aplicable"}
          </span>
        )}
      </div>
    </div>
  );
}

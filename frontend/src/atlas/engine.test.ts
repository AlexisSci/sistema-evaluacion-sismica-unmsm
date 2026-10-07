import { describe, it, expect } from "vitest";
import {
  analyze,
  orderEvents,
  filterEventList,
  defaults,
  haversine,
  matches,
  readUrl,
  sectionPosition,
  sectionGeometry,
  similar,
  writeUrl,
} from "./engine";
import { eventColor, magnitudeBands } from "./types";
import type { Event, Manifest } from "./types";
const m = {
  minYear: 1960,
  maxYear: 2026,
  stdMagnitude: 1,
  stdDepth: 100,
} as Manifest;
const event = (id: string, change: Partial<Event> = {}): Event => ({
  id,
  date: "2000-01-01T00:00:00Z",
  year: 2000,
  lat: -12,
  lon: -77,
  depth: 30,
  mag: 5,
  sourceRow: 2,
  kmeans: 0,
  dbscan: -1,
  usgs: null,
  intensity: null,
  intensitySource: null,
  impact: null,
  ...change,
});
describe("atlas", () => {
  it("combina límites inclusivos, año y rectángulo", () => {
    const f = {
      ...defaults(m),
      year: 2000,
      bounds: [-78, -13, -77, -12] as [number, number, number, number],
      minMag: 5,
      maxMag: 5,
    };
    expect(matches(event("a"), f)).toBe(true);
    expect(matches(event("a", { year: 2001 }), f)).toBe(false);
    expect(matches(event("a", { lon: -76 }), f)).toBe(false);
  });
  it("conserva filtros, capa y selección en URL", () => {
    const f = {
      ...defaults(m),
      year: 2001,
      minDepth: 30,
      bounds: [-80, -15, -70, -5] as [number, number, number, number],
    };
    const state = readUrl(m, writeUrl(f, "igp-example", "dbscan", "atlas"));
    expect(state.filters).toEqual(f);
    expect(state.selected).toBe("igp-example");
    expect(state.layer).toBe("dbscan");
  });
  it("rechaza parámetros URL inválidos y rectángulos invertidos", () => {
    const s = readUrl(m, "?from=NaN&to=9999&box=5,5,-5,-5&layer=bad");
    expect(s.filters.end).toBe(2026);
    expect(s.filters.start).toBe(1960);
    expect(s.filters.bounds).toBeNull();
    expect(s.layer).toBe("depth");
  });
  it("similitud usa escalas físicas, excluye origen y desempata por distancia", () => {
    const all = [
      event("origin"),
      event("near"),
      event("far", { lon: -70 }),
      event("other", { mag: 6 }),
    ];
    const result = similar(
      all,
      { latitud: -12, longitud: -77, magnitud: 5, profundidad_km: 30 },
      m,
      null,
      "origin",
    );
    expect(result.map((r) => r.event.id)).toEqual(["near", "far", "other"]);
    expect(result[0].score).toBe(0);
  });
  it("radio no se amplía y no inventa cinco resultados", () => {
    expect(
      similar(
        [event("far", { lon: 0 })],
        { latitud: -12, longitud: -77, magnitud: 5, profundidad_km: 30 },
        m,
        50,
      ),
    ).toHaveLength(0);
  });
  it("haversine produce distancias conocidas y corte excluye más allá de los extremos", () => {
    expect(haversine([0, 0], [1, 0])).toBeCloseTo(111.195, 2);
    expect(
      sectionPosition(
        [1, 0],
        [
          [0, 0],
          [2, 0],
        ],
      ).along,
    ).toBeCloseTo(111.195, 2);
    expect(
      sectionPosition(
        [1, 1],
        [
          [0, 0],
          [2, 0],
        ],
      ).cross,
    ).toBeCloseTo(-111.195, 2);
    const r = analyze(
      [
        event("in", { lon: 1, lat: 0 }),
        event("out", { lon: 3, lat: 0 }),
        event("side", { lon: 1, lat: 1 }),
      ],
      defaults(m),
      [
        [0, 0],
        [2, 0],
      ],
      100,
      "depth",
    );
    expect(r.section.map((p) => p.id)).toEqual(["in"]);
  });
  it("mediana par y cero resultados sin valores falsos", () => {
    expect(
      analyze(
        [event("a", { depth: 10 }), event("b", { depth: 20 })],
        defaults(m),
        null,
        100,
        "depth",
      ).summary.medianDepth,
    ).toBe(15);
    const r = analyze([], defaults(m), null, 100, "depth");
    expect(r.summary.maxMag).toBeNull();
    expect(r.summary.medianDepth).toBeNull();
  });
  it("grupos se resumen sin recalcular etiquetas y conteos de gráficos coinciden", () => {
    const r = analyze(
      [event("a", { kmeans: 3 }), event("b", { kmeans: 3, depth: 600 })],
      defaults(m),
      null,
      100,
      "kmeans",
    );
    expect(r.groups[0].id).toBe(3);
    expect(r.groups[0].count).toBe(2);
    expect(r.summary.depths.reduce((n, b) => n + b[1], 0)).toBe(2);
  });
});

describe("franja esférica del corte", () => {
  it("sitúa los bordes a la mitad del ancho y conserva la longitud", () => {
    const segment: [[number, number], [number, number]] = [
      [-79, -12],
      [-70, -12],
    ];
    const { centre, polygon } = sectionGeometry(segment, 100);
    for (const p of centre)
      expect(Math.abs(sectionPosition(p, segment).cross)).toBeLessThan(0.00001);
    for (const p of polygon)
      expect(Math.abs(sectionPosition(p, segment).cross)).toBeCloseTo(50, 5);
    expect(
      sectionPosition(centre[centre.length - 1], segment).along,
    ).toBeCloseTo(haversine(...segment), 5);
    expect(polygon[0]).toEqual(polygon[polygon.length - 1]);
  });
});

describe("meses y orden local de la lista", () => {
  it("filtra meses completos y valores físicos sin alterar el catálogo", () => {
    const list = [
      event("a", { date: "2009-02-28T23:59:59Z", mag: 5 }),
      event("b", { date: "2009-03-01T00:00:00Z", mag: 7 }),
    ];
    const filters = {
      firstMonth: 2,
      lastMonth: 2,
      minMag: 0,
      maxMag: 10,
      minDepth: 0,
      maxDepth: 1000,
    };
    expect(filterEventList(list, filters).map((e) => e.id)).toEqual(["a"]);
    expect(filterEventList(list, { ...filters, minMag: 6 })).toEqual([]);
    expect(list).toHaveLength(2);
  });
  it("ordena el conjunto antes de paginar, sin mutarlo", () => {
    const list = [
      event("a", { mag: 4, depth: 100 }),
      event("b", { mag: 7, depth: 10 }),
    ];
    expect(orderEvents(list, "magnitude-desc")[0].id).toBe("b");
    expect(orderEvents(list, "depth-desc")[0].id).toBe("a");
    expect(orderEvents(list, "depth-asc")[0].id).toBe("b");
    expect(list[0].id).toBe("a");
  });
  it("recupera la capa de magnitud de la URL", () => {
    expect(
      readUrl(m, writeUrl(defaults(m), null, "magnitude", "atlas")).layer,
    ).toBe("magnitude");
  });
});

describe("navegación TECTA", () => {
  it("mantiene las URLs anteriores y cuatro espacios", () => {
    expect(readUrl(m, "?view=atlas&year=2000&event=a").view).toBe("explore");
    expect(readUrl(m, "?view=lab").view).toBe("simulate");
    for (const view of ["explore", "analyze", "simulate", "science"])
      expect(readUrl(m, `?view=${view}`).view).toBe(view);
    expect(readUrl(m, "?view=atlas&year=2000&event=a").selected).toBe("a");
  });
});

describe("lenguaje de datos TECTA", () => {
  it("conserva límites de profundidad y magnitud", () => {
    expect(eventColor({ depth: 60, mag: 4 }, "depth")).toBe("#38BFA7");
    expect(eventColor({ depth: 300, mag: 4 }, "depth")).toBe("#D9AA5A");
    expect(eventColor({ depth: 301, mag: 4 }, "depth")).toBe("#AF9DE1");
    expect(eventColor({ depth: 1, mag: 7 }, "magnitude")).toBe(
      magnitudeBands[4].color,
    );
    expect(eventColor({ depth: 1, mag: 4, dbscan: -1 }, "dbscan")).toBe(
      "#82949B",
    );
  });
});

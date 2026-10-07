import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { analyze, defaults, similar } from "./engine";
import type { Event, Manifest } from "./types";
const manifest: Manifest = JSON.parse(
  readFileSync(
    new URL("../../public/data/manifest.json", import.meta.url),
    "utf8",
  ),
);
const events: Event[] = JSON.parse(
  readFileSync(
    new URL(`../../public/data/${manifest.file}`, import.meta.url),
    "utf8",
  ),
);
describe("catálogo completo", () => {
  it("filtros y búsquedas procesan todos los eventos con conteos coherentes", () => {
    const start = performance.now();
    const a = analyze(
      events,
      defaults(manifest),
      [
        [-79, -12],
        [-70, -12],
      ],
      100,
      "kmeans",
    );
    const b = similar(
      events,
      { latitud: -12, longitud: -77, magnitud: 5, profundidad_km: 30 },
      manifest,
      null,
    );
    const elapsed = performance.now() - start;
    expect(a.summary.count).toBe(manifest.count);
    expect(a.groups.reduce((n, g) => n + g.count, 0)).toBe(manifest.count);
    expect(a.section.length).toBeGreaterThan(0);
    expect(b).toHaveLength(5);
    console.info(
      `Catálogo ${events.length}: análisis y similares ${elapsed.toFixed(1)} ms`,
    );
  });
  it("magnitud ≥7 y año 1960 coinciden con consultas directas", () => {
    const f = { ...defaults(manifest), minMag: 7 };
    expect(analyze(events, f, null, 100, "depth").summary.count).toBe(39);
    expect(
      analyze(events, { ...defaults(manifest), year: 1960 }, null, 100, "depth")
        .summary.count,
    ).toBe(26);
  });
});

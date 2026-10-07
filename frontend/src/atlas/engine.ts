import type {
  Event,
  EventOrder,
  Filters,
  Manifest,
  Scenario,
  Similar,
  Segment,
  Point,
  Analysis,
  Layer,
} from "./types";
const R = 6371.0088,
  rad = (n: number) => (n * Math.PI) / 180;
export function haversine(a: Point, b: Point) {
  const [x, y] = a.map(rad),
    [u, v] = b.map(rad);
  return (
    2 *
    R *
    Math.asin(
      Math.sqrt(
        Math.min(
          1,
          Math.sin((v - y) / 2) ** 2 +
            Math.cos(y) * Math.cos(v) * Math.sin((u - x) / 2) ** 2,
        ),
      ),
    )
  );
}
function bearing(a: Point, b: Point) {
  const [x, y] = a.map(rad),
    [u, v] = b.map(rad);
  return Math.atan2(
    Math.sin(u - x) * Math.cos(v),
    Math.cos(y) * Math.sin(v) - Math.sin(y) * Math.cos(v) * Math.cos(u - x),
  );
}
export function sectionPosition(p: Point, s: Segment) {
  const d = haversine(s[0], p) / R,
    delta = bearing(s[0], p) - bearing(s[0], s[1]);
  return {
    along: Math.atan2(Math.sin(d) * Math.cos(delta), Math.cos(d)) * R,
    cross:
      Math.asin(Math.max(-1, Math.min(1, Math.sin(d) * Math.sin(delta)))) * R,
  };
}
// Offset from a great-circle centreline: the same spherical geometry as sectionPosition.
export function sectionGeometry(s: Segment, width: number) {
  const length = haversine(s[0], s[1]);
  const heading = bearing(s[0], s[1]);
  function destination(a: Point, angle: number, distance: number): Point {
    const lon = rad(a[0]),
      lat = rad(a[1]),
      d = distance / R;
    const y = Math.asin(
      Math.sin(lat) * Math.cos(d) +
        Math.cos(lat) * Math.sin(d) * Math.cos(angle),
    );
    const x =
      lon +
      Math.atan2(
        Math.sin(angle) * Math.sin(d) * Math.cos(lat),
        Math.cos(d) - Math.sin(lat) * Math.sin(y),
      );
    return [(((x * 180) / Math.PI + 540) % 360) - 180, (y * 180) / Math.PI];
  }
  const steps = Math.max(2, Math.ceil(length / 20));
  const centre: Point[] = [],
    left: Point[] = [],
    right: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const p = destination(s[0], heading, (length * i) / steps);
    const forward = i === steps ? bearing(p, s[0]) + Math.PI : bearing(p, s[1]);
    centre.push(p);
    left.push(destination(p, forward - Math.PI / 2, width / 2));
    right.push(destination(p, forward + Math.PI / 2, width / 2));
  }
  return { centre, polygon: [...left, ...right.reverse(), left[0]] };
}
export function defaults(m: Manifest): Filters {
  return {
    start: m.minYear,
    end: m.maxYear,
    minMag: 0,
    maxMag: 10,
    minDepth: 0,
    maxDepth: 1000,
    bounds: null,
    year: null,
  };
}
export function matches(e: Event, f: Filters) {
  return (
    e.year >= f.start &&
    e.year <= f.end &&
    (f.year === null || e.year === f.year) &&
    e.mag >= f.minMag &&
    e.mag <= f.maxMag &&
    e.depth >= f.minDepth &&
    e.depth <= f.maxDepth &&
    (!f.bounds ||
      (e.lon >= f.bounds[0] &&
        e.lon <= f.bounds[2] &&
        e.lat >= f.bounds[1] &&
        e.lat <= f.bounds[3]))
  );
}
export function similar(
  events: Event[],
  s: Scenario,
  m: Pick<Manifest, "stdMagnitude" | "stdDepth">,
  radius: number | null,
  exclude?: string,
): Similar[] {
  return events
    .filter((e) => e.id !== exclude)
    .map((event) => {
      const deltaMag = event.mag - s.magnitud,
        deltaDepth = event.depth - s.profundidad_km;
      return {
        event,
        deltaMag,
        deltaDepth,
        distance: haversine([s.longitud, s.latitud], [event.lon, event.lat]),
        score: Math.hypot(
          deltaMag / (m.stdMagnitude || 1),
          deltaDepth / (m.stdDepth || 1),
        ),
      };
    })
    .filter((e) => radius === null || e.distance <= radius)
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.distance - b.distance ||
        a.event.id.localeCompare(b.event.id),
    )
    .slice(0, 5);
}
export function analyze(
  events: Event[],
  f: Filters,
  segment: Segment | null,
  width: number,
  layer: Layer,
): Analysis {
  const filtered = events.filter((e) => matches(e, f)),
    depths = filtered.map((e) => e.depth).sort((a, b) => a - b),
    years = new Map<number, number>(),
    magBins = [0, 0, 0, 0, 0, 0],
    depthBins = [0, 0, 0],
    groups = new Map<
      number,
      { id: number; count: number; meanDepth: number; maxMagnitude: number }
    >();
  const section: Analysis["section"] = [],
    sectionLength = segment ? haversine(...segment) : 0;
  for (const e of filtered) {
    years.set(e.year, (years.get(e.year) || 0) + 1);
    magBins[Math.min(5, Math.max(0, Math.floor(e.mag) - 3))]++;
    depthBins[e.depth <= 60 ? 0 : e.depth <= 300 ? 1 : 2]++;
    if (segment && sectionLength > 0) {
      const p = sectionPosition([e.lon, e.lat], segment);
      if (
        p.along >= 0 &&
        p.along <= sectionLength &&
        Math.abs(p.cross) <= width / 2
      )
        section.push({
          id: e.id,
          distance: p.along,
          kmeans: e.kmeans,
          dbscan: e.dbscan,
          depth: e.depth,
          mag: e.mag,
        });
    }
    const id =
      layer === "kmeans" ? e.kmeans : layer === "dbscan" ? e.dbscan : null;
    if (id !== null) {
      const g = groups.get(id) || {
        id,
        count: 0,
        meanDepth: 0,
        maxMagnitude: 0,
      };
      g.count++;
      g.meanDepth += e.depth;
      g.maxMagnitude = Math.max(g.maxMagnitude, e.mag);
      groups.set(id, g);
    }
  }
  const n = depths.length;
  return {
    period: f.year !== null ? String(f.year) : `${f.start} — ${f.end}`,
    ids: filtered.map((e) => e.id),
    section,
    sectionLength,
    groups: [...groups.values()]
      .sort((a, b) => a.id - b.id)
      .map((g) => ({ ...g, meanDepth: g.meanDepth / g.count })),
    summary: {
      count: n,
      maxMag: n ? Math.max(...filtered.map((e) => e.mag)) : null,
      medianDepth: n
        ? (depths[Math.floor((n - 1) / 2)] + depths[Math.floor(n / 2)]) / 2
        : null,
      years: [...years.entries()].sort((a, b) => a[0] - b[0]),
      magnitudes: magBins.map((v, i) => [
        ["<4", "4–5", "5–6", "6–7", "7–8", "≥8"][i],
        v,
      ]),
      depths: depthBins.map((v, i) => [
        ["≤60 km", "60–300 km", ">300 km"][i],
        v,
      ]),
    },
  };
}
export function readUrl(m: Manifest, search: string) {
  const p = new URLSearchParams(search),
    f = defaults(m);
  const number = (key: string, fallback: number, min: number, max: number) => {
    const raw = p.get(key),
      v = raw === null ? NaN : Number(raw);
    return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  };
  f.start = Math.round(number("from", f.start, m.minYear, m.maxYear));
  f.end = Math.max(
    f.start,
    Math.round(number("to", f.end, m.minYear, m.maxYear)),
  );
  f.minMag = number("m", 0, 0, 10);
  f.maxMag = number("M", 10, f.minMag, 10);
  f.minDepth = number("d", 0, 0, 1000);
  f.maxDepth = number("D", 1000, f.minDepth, 1000);
  if (p.has("year"))
    f.year = Math.round(number("year", f.start, f.start, f.end));
  const b = p.get("box")?.split(",").map(Number);
  if (
    b?.length === 4 &&
    b.every(Number.isFinite) &&
    b[0] >= -180 &&
    b[2] <= 180 &&
    b[1] >= -90 &&
    b[3] <= 90 &&
    b[0] < b[2] &&
    b[1] < b[3]
  )
    f.bounds = b as Filters["bounds"];
  return {
    filters: f,
    selected: p.get("event"),
    layer: (["depth", "magnitude", "kmeans", "dbscan"].includes(
      p.get("layer") || "",
    )
      ? p.get("layer")
      : "depth") as Layer,
    view: (p.get("view") === "lab"
      ? "simulate"
      : ["explore", "analyze", "simulate", "science"].includes(
            p.get("view") || "",
          )
        ? p.get("view")
        : "explore") as import("./types").View,
  };
}
export function writeUrl(
  f: Filters,
  selected: string | null,
  layer: Layer,
  view: string,
) {
  const p = new URLSearchParams({
    from: String(f.start),
    to: String(f.end),
    m: String(f.minMag),
    M: String(f.maxMag),
    d: String(f.minDepth),
    D: String(f.maxDepth),
    layer,
    view,
  });
  if (f.year !== null) p.set("year", String(f.year));
  if (f.bounds) p.set("box", f.bounds.join(","));
  if (selected) p.set("event", selected);
  return "?" + p.toString();
}

export function orderEvents(events: Event[], order: EventOrder): Event[] {
  return [...events].sort((a, b) => {
    const value =
      order === "oldest"
        ? a.date.localeCompare(b.date)
        : order === "magnitude-desc"
          ? b.mag - a.mag
          : order === "magnitude-asc"
            ? a.mag - b.mag
            : order === "depth-asc"
              ? a.depth - b.depth
              : order === "depth-desc"
                ? b.depth - a.depth
                : b.date.localeCompare(a.date);
    return value || b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
  });
}

export type ListFilters = {
  firstMonth: number;
  lastMonth: number;
  minMag: number;
  maxMag: number;
  minDepth: number;
  maxDepth: number;
};
export function filterEventList(
  events: Event[],
  filters: ListFilters,
): Event[] {
  return events.filter((e) => {
    const month = Number(e.date.slice(5, 7));
    return (
      month >= filters.firstMonth &&
      month <= filters.lastMonth &&
      e.mag >= filters.minMag &&
      e.mag <= filters.maxMag &&
      e.depth >= filters.minDepth &&
      e.depth <= filters.maxDepth
    );
  });
}

export type Event = {
  id: string;
  date: string;
  year: number;
  lat: number;
  lon: number;
  depth: number;
  mag: number;
  sourceRow: number;
  kmeans: number;
  dbscan: number | null;
  usgs: string | null;
  intensity: number | null;
  intensitySource: string | null;
  impact: string | null;
  place?: string | null;
  matchKm?: number;
  matchSeconds?: number;
};
export type Group = {
  id: number;
  count: number;
  meanDepth: number;
  maxMagnitude: number;
};
export type Manifest = {
  version: string;
  file: string;
  count: number;
  minYear: number;
  maxYear: number;
  start: string;
  end: string;
  stdMagnitude: number;
  stdDepth: number;
  sources: string[];
  counts: { intensity: number; usgs: number; shallow: number };
  groups: { kmeans: Group[]; dbscan: Group[] };
  audit: {
    correctedDates: number;
    changedAssociations: number;
    changedTargets: number;
    issues: number;
  };
  model: { status: string; trainingCompatible: boolean; note: string };
};
export type Point = [number, number];
export type Bounds = [number, number, number, number];
export type Segment = [Point, Point];
export type Layer = "depth" | "magnitude" | "kmeans" | "dbscan";
export type Filters = {
  start: number;
  end: number;
  minMag: number;
  maxMag: number;
  minDepth: number;
  maxDepth: number;
  bounds: Bounds | null;
  year: number | null;
};
export type Scenario = {
  latitud: number;
  longitud: number;
  profundidad_km: number;
  magnitud: number;
};
export type Similar = {
  event: Event;
  distance: number;
  score: number;
  deltaMag: number;
  deltaDepth: number;
};
export type Summary = {
  count: number;
  maxMag: number | null;
  medianDepth: number | null;
  years: [number, number][];
  magnitudes: [string, number][];
  depths: [string, number][];
};
export type SectionPoint = {
  kmeans?: number;
  dbscan?: number | null;
  id: string;
  distance: number;
  depth: number;
  mag: number;
};
export type Analysis = {
  period: string;
  ids: string[];
  summary: Summary;
  section: SectionPoint[];
  sectionLength: number;
  groups: Group[];
};
export const palette = [
  "#38BFA7",
  "#D9AA5A",
  "#AF9DE1",
  "#D38DAD",
  "#58B4D0",
  "#829247",
  "#b974a1",
  "#4d9b99",
  "#bca35a",
  "#697eaf",
  "#93684f",
];
export const dateLabel = (s: string) =>
  new Date(s).toLocaleString("es-PE", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }) + " UTC";

export type EventOrder =
  | "recent"
  | "oldest"
  | "magnitude-desc"
  | "magnitude-asc"
  | "depth-asc"
  | "depth-desc";
export const magnitudeBands = [
  { max: 4, label: "M <4", color: "#8AAFAC" },
  { max: 5, label: "M 4–<5", color: "#58B4D0" },
  { max: 6, label: "M 5–<6", color: "#D9AA5A" },
  { max: 7, label: "M 6–<7", color: "#EFA878" },
  { max: Infinity, label: "M ≥7", color: "#D38DAD" },
];

export type View = "explore" | "analyze" | "simulate" | "science";

export function eventColor(
  e: { depth: number; mag: number; kmeans?: number; dbscan?: number | null },
  layer: Layer,
): string {
  if (layer === "depth")
    return e.depth <= 60 ? "#38BFA7" : e.depth <= 300 ? "#D9AA5A" : "#AF9DE1";
  if (layer === "magnitude")
    return magnitudeBands.find((b) => e.mag < b.max)!.color;
  const group = layer === "kmeans" ? e.kmeans : e.dbscan;
  return group === null || group === undefined || group < 0
    ? "#82949B"
    : palette[group % palette.length];
}

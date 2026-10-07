import { analyze, similar } from "./engine";
import type {
  Event,
  Manifest,
  Filters,
  Segment,
  Layer,
  Scenario,
} from "./types";
let events: Event[] = [],
  manifest: Manifest;
self.onmessage = (message: MessageEvent) => {
  const q = message.data;
  try {
    if (q.type === "init") {
      events = q.events;
      manifest = q.manifest;
      return;
    }
    if (q.type === "analyze") {
      const r = analyze(
        events,
        q.filters as Filters,
        q.segment as Segment | null,
        q.width,
        q.layer as Layer,
      );
      self.postMessage({ type: q.type, id: q.id, result: r });
    }
    if (q.type === "similar") {
      self.postMessage({
        type: q.type,
        id: q.id,
        result: similar(
          events,
          q.scenario as Scenario,
          manifest,
          q.radius,
          q.exclude,
        ),
      });
    }
  } catch (e) {
    self.postMessage({
      type: q.type,
      id: q.id,
      error: e instanceof Error ? e.message : "Error de cálculo",
    });
  }
};

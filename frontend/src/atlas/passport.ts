import { jsPDF } from "jspdf";
import type { Event, Manifest } from "./types";
import { dateLabel } from "./types";

async function schematic(event: Event) {
  const response = await fetch("/data/peru.geojson");
  if (!response.ok)
    throw new Error("No se pudo cargar el contorno de respaldo.");
  const geo = await response.json(),
    canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 620;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#e9f0ee";
  ctx.fillRect(0, 0, 1200, 620);
  const minX = Math.min(-84, event.lon - 1),
    maxX = Math.max(-67, event.lon + 1),
    minY = Math.min(-20, event.lat - 1),
    maxY = Math.max(1, event.lat + 1);
  const scale = Math.min(1100 / (maxX - minX), 540 / (maxY - minY)),
    ox = (1200 - (maxX - minX) * scale) / 2,
    oy = (620 - (maxY - minY) * scale) / 2;
  const p = (x: number, y: number) => [
    ox + (x - minX) * scale,
    oy + (maxY - y) * scale,
  ];
  for (const f of geo.features) {
    const polys =
      f.geometry.type === "Polygon"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates;
    for (const rings of polys) {
      ctx.beginPath();
      for (const ring of rings) {
        ring.forEach((point: number[], i: number) => {
          const [x, y] = p(point[0], point[1]);
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.closePath();
      }
      ctx.fillStyle = "#f5f1e5";
      ctx.fill("evenodd");
      ctx.strokeStyle = "#b7b4a3";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  const [x, y] = p(event.lon, event.lat);
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fillStyle = "#bb5f3e";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#234b43";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText("PERÚ", p(-74, -10)[0], p(-74, -10)[1]);
  ctx.font = "18px sans-serif";
  ctx.fillText(
    "Ubicación esquemática · Natural Earth (dominio público)",
    24,
    590,
  );
  return canvas.toDataURL("image/png");
}
async function mapImage(
  event: Event,
): Promise<{ image: string; credit: string }> {
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "fixed",
    left: "-1400px",
    top: "0",
    width: "1000px",
    height: "520px",
  });
  document.body.appendChild(host);
  let map: import("maplibre-gl").Map | undefined;
  try {
    const { Map, Marker } = await import("maplibre-gl");
    map = new Map({
      container: host,
      style: "/data/map-style.json",
      center: [event.lon, event.lat],
      zoom: 5,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      interactive: false,
      attributionControl: false,
    });
    new Marker({ color: "#b45e3c" })
      .setLngLat([event.lon, event.lat])
      .addTo(map);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 7000);
      map!.once("idle", () => {
        clearTimeout(timer);
        resolve();
      });
      map!.once("error", () => {
        clearTimeout(timer);
        reject(new Error("cartography"));
      });
    });
    // Markers are DOM elements and are absent from the canvas: draw the location explicitly.
    const canvas = document.createElement("canvas"),
      source = map.getCanvas();
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(source, 0, 0);
    ctx.beginPath();
    ctx.arc(
      canvas.width / 2,
      canvas.height / 2,
      10 * devicePixelRatio,
      0,
      2 * Math.PI,
    );
    ctx.fillStyle = "#b45e3c";
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;
    ctx.stroke();
    return {
      image: canvas.toDataURL("image/png"),
      credit: "OpenFreeMap / OpenMapTiles / © OpenStreetMap contributors",
    };
  } catch {
    return {
      image: await schematic(event),
      credit: "Ubicación esquemática. Natural Earth, dominio público.",
    };
  } finally {
    map?.remove();
    host.remove();
  }
}
export async function buildPassport(event: Event, manifest: Manifest) {
  const { image, credit } = await mapImage(event),
    doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFillColor("#f7f5ed");
  doc.rect(0, 0, 210, 297, "F");
  doc.setTextColor("#17232d");
  doc.setFont("helvetica", "bold");
  doc.setDrawColor("#E9672B");
  doc.setLineWidth(0.7);
  doc.circle(186, 18, 5);
  doc.circle(186, 18, 3);
  doc.setFontSize(10);
  doc.text("TECTA / PERÚ EN MOVIMIENTO", 18, 19);
  doc.setFontSize(26);
  doc.text("Pasaporte del evento", 18, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(event.id, 18, 43);
  doc.text(dateLabel(event.date), 18, 50);
  doc.addImage(image, "PNG", 18, 58, 174, 90);
  doc.setFontSize(7);
  doc.text(credit, 18, 153);
  const fields = [
    ["Magnitud", `${event.mag.toFixed(1)} M`],
    ["Profundidad", `${event.depth} km`],
    ["Latitud / longitud", `${event.lat.toFixed(4)} / ${event.lon.toFixed(4)}`],
    ["Grupo K-Means", String(event.kmeans)],
    [
      "DBSCAN",
      event.dbscan === null
        ? "No aplicable (>60 km)"
        : event.dbscan < 0
          ? "Disperso"
          : `Concentración ${event.dbscan}`,
    ],
    [
      "Intensidad asociada",
      event.intensity === null
        ? "Sin información"
        : `${event.intensity} (${event.intensitySource})`,
    ],
  ];
  fields.forEach(([label, value], i) => {
    const col = i % 2,
      row = Math.floor(i / 2),
      x = 18 + col * 89,
      y = 164 + row * 18;
    doc.setFontSize(8);
    doc.setTextColor("#65756c");
    doc.text(label, x, y);
    doc.setFontSize(11);
    doc.setTextColor("#17232d");
    doc.text(value, x, y + 6);
  });
  doc.setFontSize(8);
  const sourceText = `Fuente: catálogo IGP, fila ${event.sourceRow}. ${event.usgs ? `Asociación automática USGS: ${event.usgs}. Distancia ${event.matchKm} km; diferencia temporal ${event.matchSeconds} s.` : "Sin asociación USGS publicada."}`;
  doc.text(doc.splitTextToSize(sourceText, 174), 18, 222);
  if (event.usgs)
    doc.textWithLink("Consultar evento en USGS", 18, 237, {
      url: `https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(event.usgs)}`,
    });
  doc.setTextColor("#76654f");
  doc.text(
    doc.splitTextToSize(
      "Ficha histórica. La intensidad asociada proviene de USGS y no describe cada ciudad. Los grupos son resultados espaciales; no representan pronósticos ni alertas.",
      174,
    ),
    18,
    247,
  );
  doc.setDrawColor("#ccd3c8");
  doc.line(18, 268, 192, 268);
  doc.setFontSize(8);
  doc.setTextColor("#65756c");
  doc.text(
    `Catálogo ${manifest.version} | Generado ${new Date().toISOString().slice(0, 10)} UTC`,
    18,
    276,
  );
  doc.text("UNMSM · Proyecto académico | 1 / 1", 18, 283);
  return doc;
}
export async function downloadPassport(event: Event, manifest: Manifest) {
  const doc = await buildPassport(event, manifest);
  doc.save(`pasaporte-${event.id}.pdf`);
}

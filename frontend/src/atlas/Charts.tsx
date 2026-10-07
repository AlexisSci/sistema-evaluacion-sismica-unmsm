import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, ScatterChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { eventColor } from "./types";
import type { Analysis, Layer } from "./types";
echarts.use([
  BarChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  CanvasRenderer,
]);
function Chart({
  option,
  onClick,
  label,
}: {
  option: echarts.EChartsCoreOption;
  onClick?: (p: unknown) => void;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const chart = echarts.init(host.current!);
    chart.setOption(option);
    if (onClick) chart.on("click", onClick);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(host.current!);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option, onClick]);
  return <div className="chart" ref={host} role="img" aria-label={label} />;
}
const base = {
  animation: false,
  grid: { top: 22, right: 15, bottom: 40, left: 48 },
  tooltip: { trigger: "axis", renderMode: "richText" },
  backgroundColor: "transparent",
  textStyle: { fontFamily: "system-ui", color: "#a2afb5", fontSize: 10 },
};
export default function Charts({
  analysis,
  layer = "depth",
  section,
  selected,
  onSelect,
}: {
  analysis: Analysis;
  layer?: Layer;
  section: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (section)
    return (
      <Chart
        label="Corte de profundidad: distancia horizontal en kilómetros y profundidad creciente hacia abajo"
        option={{
          ...base,
          tooltip: {
            trigger: "item",
            renderMode: "richText",
            formatter: (p: unknown) => {
              const v = (p as { value: [number, number, number, string] })
                .value;
              return `${v[0].toFixed(1)} km de recorrido\nProfundidad ${v[1]} km · M ${v[2]}`;
            },
          },
          grid: { ...base.grid, bottom: 52 },
          xAxis: {
            type: "value",
            min: 0,
            max: Math.max(1, analysis.sectionLength),
            name: "Distancia a lo largo del corte (km)",
            nameLocation: "middle",
            nameGap: 30,
            splitLine: { lineStyle: { color: "#23313a" } },
            axisLabel: {
              color: "#a2afb5",
              formatter: (v: number) => String(Math.round(v)),
            },
          },
          yAxis: {
            type: "value",
            inverse: true,
            min: 0,
            name: "Profundidad (km) · superficie = 0",
            splitLine: { lineStyle: { color: "#283941", type: "dashed" } },
            axisLabel: { color: "#a2afb5" },
          },
          series: [
            {
              type: "scatter",
              symbolSize: (v: number[]) => 2 + v[2] * 0.7,
              data: analysis.section.map((e) => ({
                value: [e.distance, e.depth, e.mag, e.id],
                itemStyle: {
                  color: e.id === selected ? "#E9672B" : eventColor(e, layer),
                  opacity: e.id === selected ? 1 : 0.55,
                },
              })),
            },
          ],
        }}
        onClick={(p) => {
          const v = (p as { value?: [number, number, number, string] }).value;
          if (v) onSelect(v[3]);
        }}
      />
    );
  const pairs = [
    ["Registros por año", analysis.summary.years],
    ["Magnitud", analysis.summary.magnitudes],
    ["Profundidad", analysis.summary.depths],
  ] as const;
  return (
    <div className="chart-grid">
      {pairs.map(([title, data]) => (
        <section key={title}>
          <h4>{title}</h4>
          <Chart
            label={`${title}: ${data.map(([k, v]) => `${k}: ${v}`).join("; ")}`}
            option={{
              ...base,
              xAxis: {
                type: "category",
                data: data.map((d) => d[0]),
                axisLabel: { hideOverlap: true },
                axisTick: { show: false },
              },
              yAxis: {
                type: "value",
                minInterval: 1,
                splitLine: { lineStyle: { color: "#283941" } },
                axisLabel: { color: "#a2afb5" },
              },
              series: [
                {
                  type: "bar",
                  data: data.map((d) => d[1]),
                  itemStyle: { color: "#38BFA7", borderRadius: [3, 3, 0, 0] },
                  barMaxWidth: 32,
                },
              ],
            }}
          />
        </section>
      ))}
    </div>
  );
}

import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { scaleOrdinal } from "d3-scale"
import { arc, pie } from "d3-shape"
import { formatCostShort, formatNumber } from "./chart-primitives"

export type DonutDatum = {
  label: string
  value: number
  color: string
}

export function UsageDonutChart(props: {
  data: DonutDatum[]
  width?: number
  height?: number
  formatValue?: (v: number) => string
}) {
  const [state, setState] = createStore({ hoverIndex: undefined as number | undefined })
  const width = () => props.width ?? 140
  const height = () => props.height ?? 140
  const radius = () => Math.min(width(), height()) / 2

  const formatValue = props.formatValue ?? formatNumber

  const total = createMemo(() => props.data.reduce((sum, d) => sum + d.value, 0))

  const arcs = createMemo(() => {
    const p = pie<DonutDatum>().value((d) => d.value).sort(null)
    return p(props.data) as ReturnType<typeof p>
  })

  const arcGen = createMemo(() => {
    const r = radius()
    return arc()
      .innerRadius(r * 0.6)
      .outerRadius(r * 0.95)
      .padAngle(0.015)
      .padRadius(r)
      .cornerRadius(2)
  })

  const colorScale = createMemo(() => {
    const domain = props.data.map((d) => d.label)
    const range = props.data.map((d) => d.color)
    return scaleOrdinal(domain, range)
  })

  const selected = createMemo(() => (state.hoverIndex === undefined ? undefined : props.data[state.hoverIndex]))
  const selectedLabel = createMemo(() => {
    const item = selected()
    if (!item) return "total"
    return item.label.length > 13 ? item.label.slice(0, 12) + "..." : item.label
  })

  return (
    <Show when={total() > 0} fallback={<div class="text-v2-text-text-faint text-xs py-8 text-center">No data</div>}>
      <div class="flex min-w-0 flex-col items-stretch gap-3">
        <svg width={width()} height={height()} role="img" aria-label="Breakdown donut chart" class="mx-auto block shrink-0 overflow-visible">
          <g transform={`translate(${width() / 2},${height() / 2})`}>
            <For each={arcs()}>
              {(a, index) => (
                <path
                  d={(arcGen()(a as never) ?? "") as string}
                  fill={colorScale()(a.data.label)}
                  stroke="var(--v2-background-bg-base)"
                  stroke-width={state.hoverIndex === index() ? 2 : 1}
                  opacity={state.hoverIndex === undefined || state.hoverIndex === index() ? 1 : 0.45}
                  class="transition-opacity"
                  onPointerEnter={() => setState("hoverIndex", index())}
                  onPointerLeave={() => setState("hoverIndex", undefined)}
                />
              )}
            </For>
            <text text-anchor="middle" dy="-0.2em" class="fill-v2-text-text-base" font-size="16" font-weight="530">
              {selected() ? formatValue(selected()!.value) : props.data.length > 0 ? formatValue(total()) : ""}
            </text>
            <text text-anchor="middle" dy="1.1em" class="fill-v2-text-text-faint" font-size="9">
              {selectedLabel()}
            </text>
          </g>
        </svg>
        <div class="flex min-w-0 flex-col gap-1.5">
          <For each={props.data}>
            {(d, index) => (
              <div
                class="flex min-w-0 items-center gap-2 text-xs transition-opacity"
                classList={{ "opacity-50": state.hoverIndex !== undefined && state.hoverIndex !== index() }}
              >
                <span class="size-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                <span class="min-w-0 flex-1 truncate text-v2-text-text-muted">{d.label}</span>
                <span class="shrink-0 text-v2-text-text-base [font-weight:530]">{formatValue(d.value)}</span>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}

export function costDonutColor(index: number): string {
  const palette = ["#7698fd", "#49c970", "#ff8648", "#9e99f7", "#f26cb2", "#00c5df", "#f6c251", "#f17471"]
  return palette[index % palette.length]
}

export { formatCostShort }

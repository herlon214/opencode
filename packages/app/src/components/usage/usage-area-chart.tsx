import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { scaleLinear, scaleUtc } from "d3-scale"
import { area, curveMonotoneX, line } from "d3-shape"
import { max } from "d3-array"
import { timeFormat } from "d3-time-format"
import { CHART_COLORS, formatCostShort, formatNumber } from "./chart-primitives"

type TimeseriesPoint = {
  date: string
  cost: number | string
  tokens: {
    input: number | string
    output: number | string
    reasoning: number | string
    cache_read: number | string
    cache_write: number | string
  }
  sessions: number | string
}

const num = (v: number | string): number => (typeof v === "number" ? v : Number(v) || 0)

type ChartMode = "cost" | "tokens"

function parseDate(point: TimeseriesPoint): Date {
  return new Date(point.date + "T00:00:00Z")
}

const monthDay = timeFormat("%b %d")

export function UsageAreaChart(props: {
  data: TimeseriesPoint[]
  mode: ChartMode
  width?: number
  height?: number
}) {
  const [state, setState] = createStore({ hoverIndex: undefined as number | undefined })
  const width = () => props.width ?? 680
  const height = () => props.height ?? 200
  const margin = { top: 8, right: 16, bottom: 28, left: 48 }

  const innerWidth = () => width() - margin.left - margin.right
  const innerHeight = () => height() - margin.top - margin.bottom

  const xScale = createMemo(() => {
    const dates = props.data.map(parseDate)
    if (dates.length === 0) return scaleUtc().domain([new Date(), new Date()]).range([0, innerWidth()])
    if (dates.length === 1) return scaleUtc().domain([dates[0], new Date(dates[0].getTime() + 86400000)]).range([0, innerWidth()])
    return scaleUtc().domain([dates[0], dates[dates.length - 1]]).range([0, innerWidth()])
  })

  const yMax = createMemo(() => {
    if (props.mode === "cost") {
      return max(props.data, (d) => num(d.cost)) ?? 0
    }
    return max(props.data, (d) =>
      num(d.tokens.input) + num(d.tokens.output) + num(d.tokens.reasoning) + num(d.tokens.cache_read) + num(d.tokens.cache_write),
    ) ?? 0
  })

  const yScale = createMemo(() => {
    const m = yMax()
    return scaleLinear().domain([0, m * 1.1 || 1]).range([innerHeight(), 0]).nice()
  })

  const pointData = createMemo(() =>
    props.data.map((d) => ({
      date: parseDate(d),
      value:
        props.mode === "cost"
          ? num(d.cost)
          : num(d.tokens.input) + num(d.tokens.output) + num(d.tokens.reasoning) + num(d.tokens.cache_read) + num(d.tokens.cache_write),
    })),
  )

  const layerDefs = createMemo(() => {
    if (props.mode === "cost") {
      return [{ key: "cost" as const, accessor: (d: TimeseriesPoint) => num(d.cost), color: CHART_COLORS.cost }]
    }
    const keys = ["input", "output", "reasoning", "cache_read", "cache_write"] as const
    return keys.map((key) => ({
      key,
      accessor: (d: TimeseriesPoint) => {
        switch (key) {
          case "input": return num(d.tokens.input)
          case "output": return num(d.tokens.output)
          case "reasoning": return num(d.tokens.reasoning)
          case "cache_read": return num(d.tokens.cache_read)
          case "cache_write": return num(d.tokens.cache_write)
        }
      },
      color: (CHART_COLORS as Record<string, string>)[key],
    }))
  })



  const stackedData = createMemo(() => {
    const layers = layerDefs()
    const x = xScale()
    const y = yScale()
    const cumulative = props.data.map(() => 0)

    return layers.map((layer) => {
      const points = props.data.map((d, index) => {
        const value = layer.accessor(d)
        const y0 = cumulative[index]
        const y1 = y0 + value
        cumulative[index] = y1
        return { x: x(parseDate(d)) ?? 0, y0: y(y0) ?? 0, y1: y(y1) ?? 0, value, index }
      })
      return { ...layer, points }
    })
  })

  const areaPath = (layer: ReturnType<typeof stackedData>[number]) => {
    const gen = area<{ x: number; y0: number; y1: number }>()
      .x((d) => d.x)
      .y0((d) => d.y0)
      .y1((d) => d.y1)
      .curve(curveMonotoneX)
    return gen(layer.points) ?? ""
  }

  const linePath = (layer: ReturnType<typeof stackedData>[number]) => {
    const gen = line<{ x: number; y1: number }>()
      .x((d) => d.x)
      .y((d) => d.y1)
      .curve(curveMonotoneX)
    return gen(layer.points) ?? ""
  }

  const yTicks = createMemo(() => yScale().ticks(4))

  const xTicks = createMemo(() => {
    const dates = props.data.map(parseDate)
    if (dates.length <= 1) return dates
    const step = Math.max(1, Math.floor(dates.length / 6))
    return dates.filter((_, i) => i % step === 0)
  })

  const formatY = (v: number) => {
    if (props.mode === "cost") return formatCostShort(v)
    return formatNumber(v)
  }

  const hoveredPoint = createMemo(() => {
    if (state.hoverIndex === undefined) return
    return pointData()[state.hoverIndex]
  })

  const hoverX = createMemo(() => {
    const point = hoveredPoint()
    if (!point) return 0
    return xScale()(point.date) ?? 0
  })

  const hoverY = createMemo(() => {
    const point = hoveredPoint()
    if (!point) return 0
    return yScale()(point.value) ?? 0
  })

  const hoverColor = createMemo(() => (props.mode === "cost" ? CHART_COLORS.cost : CHART_COLORS.input))

  const tooltipX = createMemo(() => Math.max(4, Math.min(innerWidth() - 96, hoverX() + 10)))

  const updateHover = (event: PointerEvent) => {
    const points = pointData()
    if (points.length === 0) return
    const rect = event.currentTarget instanceof SVGRectElement ? event.currentTarget.getBoundingClientRect() : undefined
    if (!rect) return
    const pointerX = Math.max(0, Math.min(innerWidth(), ((event.clientX - rect.left) / rect.width) * innerWidth()))
    const target = xScale().invert(pointerX)
    const nearest = points.reduce((best, point, index) => {
      const distance = Math.abs(point.date.getTime() - target.getTime())
      return distance < best.distance ? { index, distance } : best
    }, { index: 0, distance: Number.POSITIVE_INFINITY })
    setState("hoverIndex", nearest.index)
  }

  return (
    <svg width={width()} height={height()} class="block max-w-full overflow-hidden" role="img" aria-label={`Usage ${props.mode} chart`}>
      <g transform={`translate(${margin.left},${margin.top})`}>
        <For each={yTicks()}>
          {(tick) => (
            <g>
              <line
                x1={0}
                x2={innerWidth()}
                y1={yScale()(tick)}
                y2={yScale()(tick)}
                stroke="var(--v2-border-border-muted)"
                stroke-width="0.5"
                opacity={0.5}
              />
              <text
                x={-8}
                y={yScale()(tick)}
                dy="0.32em"
                text-anchor="end"
                class="fill-v2-text-text-faint"
                font-size="10"
              >
                {formatY(tick)}
              </text>
            </g>
          )}
        </For>
        <For each={xTicks()}>
          {(tick) => (
            <text
              x={xScale()(tick)}
              y={innerHeight() + 18}
              text-anchor="middle"
              class="fill-v2-text-text-faint"
              font-size="10"
            >
              {monthDay(tick)}
            </text>
          )}
        </For>
        <For each={stackedData()}>
          {(layer) => (
            <>
              <path d={areaPath(layer)} fill={layer.color} opacity={props.mode === "cost" ? 0.25 : 0.75} />
              <path d={linePath(layer)} fill="none" stroke={layer.color} stroke-width="1" opacity={0.8} />
            </>
          )}
        </For>
        <Show when={props.data.length === 0}>
          <text
            x={innerWidth() / 2}
            y={innerHeight() / 2}
            text-anchor="middle"
            class="fill-v2-text-text-faint"
            font-size="12"
          >
            No data
          </text>
        </Show>
        <Show when={hoveredPoint()}>
          {(point) => (
            <g class="pointer-events-none">
              <line
                x1={hoverX()}
                x2={hoverX()}
                y1={0}
                y2={innerHeight()}
                stroke="var(--v2-border-border-strong)"
                stroke-width="0.75"
                opacity={0.55}
              />
              <circle cx={hoverX()} cy={hoverY()} r="3" fill="var(--v2-background-bg-base)" stroke={hoverColor()} stroke-width="1.5" />
              <g transform={`translate(${tooltipX()},${Math.max(4, hoverY() - 44)})`}>
                <rect width="92" height="34" rx="6" fill="var(--v2-background-bg-layer-03)" stroke="var(--v2-border-border-base)" />
                <text x="8" y="13" class="fill-v2-text-text-muted" font-size="10">
                  {monthDay(point().date)}
                </text>
                <text x="8" y="27" class="fill-v2-text-text-base" font-size="11" font-weight="530">
                  {formatY(point().value)}
                </text>
              </g>
            </g>
          )}
        </Show>
        <rect
          x={0}
          y={0}
          width={innerWidth()}
          height={innerHeight()}
          fill="transparent"
          onPointerMove={updateHover}
          onPointerLeave={() => setState("hoverIndex", undefined)}
        />
      </g>
    </svg>
  )
}

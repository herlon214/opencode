import { createMemo, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { createResizeObserver } from "@solid-primitives/resize-observer"
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

type TimeseriesByModelPoint = {
  date: string
  model: string
  providerID: string
  modelID: string
  cost: number | string
  sessions: number | string
  tokens: {
    input: number | string
    output: number | string
    reasoning: number | string
    cache_read: number | string
    cache_write: number | string
  }
}

const num = (v: number | string): number => (typeof v === "number" ? v : Number(v) || 0)

type ChartMode = "cost" | "tokens"
type ChartGroupBy = "category" | "model"

const monthDay = timeFormat("%b %d")

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`)
}

function totalTokensOf(tokens: TimeseriesPoint["tokens"]): number {
  return (
    num(tokens.input) + num(tokens.output) + num(tokens.reasoning) + num(tokens.cache_read) + num(tokens.cache_write)
  )
}

type LayerDef = {
  key: string
  label: string
  color: string
  accessor: (date: string) => number
}

const TOKEN_KEYS = ["input", "output", "reasoning", "cache_read", "cache_write"] as const

export function UsageAreaChart(props: {
  data: TimeseriesPoint[]
  byModelData?: TimeseriesByModelPoint[]
  modelColors?: Map<string, string>
  mode: ChartMode
  groupBy?: ChartGroupBy
  width?: number
  height?: number
}) {
  const [state, setState] = createStore({ hoverIndex: undefined as number | undefined })
  const width = () => props.width ?? 680
  const height = () => props.height ?? 200
  const margin = { top: 8, right: 16, bottom: 28, left: 48 }
  const groupBy = () => props.groupBy ?? "category"

  const innerWidth = () => width() - margin.left - margin.right
  const innerHeight = () => height() - margin.top - margin.bottom

  const dates = createMemo(() => {
    if (groupBy() === "model") {
      const set = new Set<string>()
      for (const point of props.byModelData ?? []) set.add(point.date)
      return [...set].sort()
    }
    return props.data.map((d) => d.date)
  })

  const byModelLookup = createMemo(() => {
    const map = new Map<string, TimeseriesByModelPoint>()
    for (const point of props.byModelData ?? []) map.set(`${point.date}\0${point.model}`, point)
    return map
  })

  const categoryLookup = createMemo(() => {
    const map = new Map<string, TimeseriesPoint>()
    for (const point of props.data) map.set(point.date, point)
    return map
  })

  const modelOrder = createMemo(() => [...new Set((props.byModelData ?? []).map((p) => p.model))])

  const xScale = createMemo(() => {
    const parsed = dates().map(parseDate)
    if (parsed.length === 0) return scaleUtc().domain([new Date(), new Date()]).range([0, innerWidth()])
    if (parsed.length === 1)
      return scaleUtc()
        .domain([parsed[0], new Date(parsed[0].getTime() + 86400000)])
        .range([0, innerWidth()])
    return scaleUtc()
      .domain([parsed[0], parsed[parsed.length - 1]])
      .range([0, innerWidth()])
  })

  const pointData = createMemo(() => {
    if (groupBy() === "model") {
      const byDate = new Map<string, number>()
      for (const point of props.byModelData ?? []) {
        const value = props.mode === "cost" ? num(point.cost) : totalTokensOf(point.tokens)
        byDate.set(point.date, (byDate.get(point.date) ?? 0) + value)
      }
      return dates().map((date) => ({ date: parseDate(date), value: byDate.get(date) ?? 0 }))
    }
    return props.data.map((d) => ({
      date: parseDate(d.date),
      value: props.mode === "cost" ? num(d.cost) : totalTokensOf(d.tokens),
    }))
  })

  const yMax = createMemo(() => max(pointData(), (d) => d.value) ?? 0)

  const yScale = createMemo(() => {
    const m = yMax()
    return scaleLinear()
      .domain([0, m * 1.1 || 1])
      .range([innerHeight(), 0])
      .nice()
  })

  const layerDefs = createMemo<LayerDef[]>(() => {
    const colors = props.modelColors ?? new Map<string, string>()
    const byModel = byModelLookup()
    const category = categoryLookup()
    if (groupBy() === "model") {
      const fallback = props.mode === "cost" ? CHART_COLORS.cost : CHART_COLORS.input
      return modelOrder().map((model) => ({
        key: model,
        label: model,
        color: colors.get(model) ?? fallback,
        accessor: (date: string) => {
          const point = byModel.get(`${date}\0${model}`)
          if (!point) return 0
          return props.mode === "cost" ? num(point.cost) : totalTokensOf(point.tokens)
        },
      }))
    }
    if (props.mode === "cost") {
      return [
        {
          key: "cost",
          label: "Cost",
          color: CHART_COLORS.cost,
          accessor: (date: string) => {
            const point = category.get(date)
            return point ? num(point.cost) : 0
          },
        },
      ]
    }
    return TOKEN_KEYS.map((key) => ({
      key,
      label: key,
      color: (CHART_COLORS as Record<string, string>)[key],
      accessor: (date: string) => {
        const point = category.get(date)
        return point ? num(point.tokens[key]) : 0
      },
    }))
  })

  const stackedData = createMemo(() => {
    const layers = layerDefs()
    const x = xScale()
    const y = yScale()
    const dateList = dates()
    const cumulative = dateList.map(() => 0)

    return layers.map((layer) => {
      const points = dateList.map((date, index) => {
        const value = layer.accessor(date)
        const y0 = cumulative[index]
        const y1 = y0 + value
        cumulative[index] = y1
        return { x: x(parseDate(date)) ?? 0, y0: y(y0) ?? 0, y1: y(y1) ?? 0, value, index }
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
    const parsed = dates().map(parseDate)
    if (parsed.length <= 1) return parsed
    const step = Math.max(1, Math.floor(parsed.length / 6))
    return parsed.filter((_, i) => i % step === 0)
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

  const hoverColor = createMemo(() => {
    if (props.mode === "cost") return CHART_COLORS.cost
    if (groupBy() === "model") {
      const layers = layerDefs()
      return layers.length > 0 ? layers[0]!.color : CHART_COLORS.input
    }
    return CHART_COLORS.input
  })

  const hoverLayers = createMemo(() => {
    const point = hoveredPoint()
    if (!point) return []
    const date = point.date.toISOString().slice(0, 10)
    const layers = stackedData()
    const entries = layers
      .map((layer) => {
        const point = layer.points.find((p) => dates()[p.index] === date)
        return point ? { label: layer.label, color: layer.color, value: point.value } : null
      })
      .filter((x): x is { label: string; color: string; value: number } => x !== null && x.value > 0)
    return entries.sort((a, b) => b.value - a.value)
  })

  const [bounds, setBounds] = createStore({ width: 0, height: 0 })
  let tooltipEl: HTMLDivElement | undefined

  const tooltipPos = createMemo(() => {
    const pointerX = hoverX() + margin.left
    const pointerY = hoverY() + margin.top
    const tw = bounds.width || 200
    const th = bounds.height || 40
    const gap = 10
    const placeLeft = pointerX + tw + gap > width() - 4
    const x = placeLeft ? Math.max(4, pointerX - tw - gap) : pointerX + gap
    const y = Math.max(4, Math.min(height() - th - 4, pointerY - th / 2))
    return { x, y }
  })

  const updateHover = (event: PointerEvent) => {
    const points = pointData()
    if (points.length === 0) return
    const rect = event.currentTarget instanceof SVGRectElement ? event.currentTarget.getBoundingClientRect() : undefined
    if (!rect) return
    const pointerX = Math.max(0, Math.min(innerWidth(), ((event.clientX - rect.left) / rect.width) * innerWidth()))
    const target = xScale().invert(pointerX)
    const nearest = points.reduce(
      (best, point, index) => {
        const distance = Math.abs(point.date.getTime() - target.getTime())
        return distance < best.distance ? { index, distance } : best
      },
      { index: 0, distance: Number.POSITIVE_INFINITY },
    )
    setState("hoverIndex", nearest.index)
  }

  return (
    <div class="relative" style={{ width: `${width()}px`, height: `${height()}px` }}>
      <svg
        width={width()}
        height={height()}
        class="block max-w-full overflow-hidden"
        role="img"
        aria-label={`Usage ${props.mode} chart`}
      >
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
          <Show when={pointData().length === 0}>
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
            <line
              x1={hoverX()}
              x2={hoverX()}
              y1={0}
              y2={innerHeight()}
              stroke="var(--v2-border-border-strong)"
              stroke-width="0.75"
              opacity={0.55}
            />
            <circle
              cx={hoverX()}
              cy={hoverY()}
              r="3"
              fill="var(--v2-background-bg-base)"
              stroke={hoverColor()}
              stroke-width="1.5"
            />
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
      <Show when={hoveredPoint()}>
        {(point) => (
          <div
            ref={(el) => {
              tooltipEl = el
              createResizeObserver(el, () => setBounds({ width: el.offsetWidth, height: el.offsetHeight }))
              onCleanup(() => (tooltipEl = undefined))
            }}
            class="pointer-events-none absolute z-10 max-w-[280px] rounded-md border border-v2-border-border-base bg-v2-background-bg-layer-03 px-2.5 py-1.5 shadow-lg"
            style={{
              left: `${tooltipPos().x}px`,
              top: `${tooltipPos().y}px`,
            }}
          >
            <div class="mb-1 text-[11px] text-v2-text-text-muted">{monthDay(point().date)}</div>
            <For each={hoverLayers()}>
              {(layer) => (
                <div class="flex items-center justify-between gap-2 whitespace-nowrap py-0.5 text-[11px]">
                  <span class="flex items-center gap-1.5">
                    <span class="size-2 shrink-0 rounded-full" style={{ background: layer.color }} />
                    <span class="text-v2-text-text-muted">{layer.label}</span>
                  </span>
                  <span class="shrink-0 text-v2-text-text-base [font-weight:530]">{formatY(layer.value)}</span>
                </div>
              )}
            </For>
          </div>
        )}
      </Show>
    </div>
  )
}

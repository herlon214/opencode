import { createMemo, For, type JSX, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useQuery } from "@tanstack/solid-query"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useGlobal } from "@/context/global"
import { ServerConnection, useServer } from "@/context/server"
import { UsageAreaChart } from "./usage-area-chart"
import { UsageDonutChart, costDonutColor, type DonutDatum } from "./usage-donut-chart"
import {
  formatCost,
  formatCostShort,
  formatNumber,
  TOKEN_CATEGORY_COLORS,
  TOKEN_CATEGORY_KEYS,
  TOKEN_CATEGORY_LABELS,
} from "./chart-primitives"

type OverviewData = {
  total_sessions: number | string
  total_messages: number | string
  total_cost: number | string
  total_tokens: {
    input: number | string
    output: number | string
    reasoning: number | string
    cache_read: number | string
    cache_write: number | string
  }
  date_range: { earliest: number | string; latest: number | string }
}

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

type ByModelItem = {
  model: string
  providerID: string
  modelID: string
  sessions: number | string
  messages: number | string
  cost: number | string
  tokens: {
    input: number | string
    output: number | string
    reasoning: number | string
    cache_read: number | string
    cache_write: number | string
  }
}

type ByAgentItem = {
  agent: string
  sessions: number | string
  cost: number | string
  tokens: {
    input: number | string
    output: number | string
    reasoning: number | string
    cache_read: number | string
    cache_write: number | string
  }
}

const num = (v: number | string): number => (typeof v === "number" ? v : Number(v) || 0)

function totalTokens(tokens: OverviewData["total_tokens"]): number {
  return num(tokens.input) + num(tokens.output) + num(tokens.reasoning) + num(tokens.cache_read) + num(tokens.cache_write)
}

function mergeOverview(items: OverviewData[]): OverviewData {
  const earliest = items.map((item) => num(item.date_range.earliest)).filter((value) => value > 0)
  return {
    total_sessions: items.reduce((sum, item) => sum + num(item.total_sessions), 0),
    total_messages: items.reduce((sum, item) => sum + num(item.total_messages), 0),
    total_cost: items.reduce((sum, item) => sum + num(item.total_cost), 0),
    total_tokens: {
      input: items.reduce((sum, item) => sum + num(item.total_tokens.input), 0),
      output: items.reduce((sum, item) => sum + num(item.total_tokens.output), 0),
      reasoning: items.reduce((sum, item) => sum + num(item.total_tokens.reasoning), 0),
      cache_read: items.reduce((sum, item) => sum + num(item.total_tokens.cache_read), 0),
      cache_write: items.reduce((sum, item) => sum + num(item.total_tokens.cache_write), 0),
    },
    date_range: {
      earliest: earliest.length > 0 ? Math.min(...earliest) : 0,
      latest: Math.max(...items.map((item) => num(item.date_range.latest)), 0),
    },
  }
}

function mergeTimeseries(items: TimeseriesPoint[][]): TimeseriesPoint[] {
  const byDate = new Map<string, TimeseriesPoint>()
  items.flat().forEach((item) => {
    const current = byDate.get(item.date)
    byDate.set(item.date, {
      date: item.date,
      cost: num(current?.cost ?? 0) + num(item.cost),
      tokens: {
        input: num(current?.tokens.input ?? 0) + num(item.tokens.input),
        output: num(current?.tokens.output ?? 0) + num(item.tokens.output),
        reasoning: num(current?.tokens.reasoning ?? 0) + num(item.tokens.reasoning),
        cache_read: num(current?.tokens.cache_read ?? 0) + num(item.tokens.cache_read),
        cache_write: num(current?.tokens.cache_write ?? 0) + num(item.tokens.cache_write),
      },
      sessions: num(current?.sessions ?? 0) + num(item.sessions),
    })
  })
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function mergeByModel(items: ByModelItem[][]): ByModelItem[] {
  const byModel = new Map<string, ByModelItem>()
  items.flat().forEach((item) => {
    const key = `${item.providerID}\0${item.modelID}`
    const current = byModel.get(key)
    byModel.set(key, {
      model: item.model,
      providerID: item.providerID,
      modelID: item.modelID,
      sessions: num(current?.sessions ?? 0) + num(item.sessions),
      messages: num(current?.messages ?? 0) + num(item.messages),
      cost: num(current?.cost ?? 0) + num(item.cost),
      tokens: {
        input: num(current?.tokens.input ?? 0) + num(item.tokens.input),
        output: num(current?.tokens.output ?? 0) + num(item.tokens.output),
        reasoning: num(current?.tokens.reasoning ?? 0) + num(item.tokens.reasoning),
        cache_read: num(current?.tokens.cache_read ?? 0) + num(item.tokens.cache_read),
        cache_write: num(current?.tokens.cache_write ?? 0) + num(item.tokens.cache_write),
      },
    })
  })
  return [...byModel.values()].sort((a, b) => num(b.cost) - num(a.cost))
}

function mergeByAgent(items: ByAgentItem[][]): ByAgentItem[] {
  const byAgent = new Map<string, ByAgentItem>()
  items.flat().forEach((item) => {
    const agent = item.agent || "default"
    const current = byAgent.get(agent)
    byAgent.set(agent, {
      agent,
      sessions: num(current?.sessions ?? 0) + num(item.sessions),
      cost: num(current?.cost ?? 0) + num(item.cost),
      tokens: {
        input: num(current?.tokens.input ?? 0) + num(item.tokens.input),
        output: num(current?.tokens.output ?? 0) + num(item.tokens.output),
        reasoning: num(current?.tokens.reasoning ?? 0) + num(item.tokens.reasoning),
        cache_read: num(current?.tokens.cache_read ?? 0) + num(item.tokens.cache_read),
        cache_write: num(current?.tokens.cache_write ?? 0) + num(item.tokens.cache_write),
      },
    })
  })
  return [...byAgent.values()].sort((a, b) => num(b.cost) - num(a.cost))
}

function costBreakdown(data: ByModelItem[], key: "modelID" | "providerID"): DonutDatum[] {
  const totals = new Map<string, number>()
  data.forEach((item) => {
    const label = item[key] || "unknown"
    totals.set(label, (totals.get(label) ?? 0) + num(item.cost))
  })
  return [...totals]
    .map(([label, value], i) => ({ label, value, color: costDonutColor(i) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
    .map((item, i) => ({ ...item, color: costDonutColor(i) }))
}

export function UsagePanel(props: { server?: ServerConnection.Any; directory?: string; directories?: string[] }) {
  const global = useGlobal()
  const server = useServer()
  const [state, setState] = createStore({
    mode: "cost" as "cost" | "tokens",
    range: 7 as 7 | 30 | 90 | 0,
    costGroup: "model" as "model" | "provider",
  })

  const daysParam = createMemo(() => (state.range > 0 ? String(state.range) : undefined))
  const directories = createMemo(() => [...new Set(props.directories ?? (props.directory ? [props.directory] : []))])
  const serverKey = createMemo(() => {
    const conn = props.server ?? server.current
    if (!conn) return
    return ServerConnection.key(conn)
  })

  const serverCtx = createMemo(() => {
    const conn = props.server ?? server.current
    if (!conn) return
    return global.ensureServerCtx(conn)
  })

  const createClient = (directory: string) => {
    const ctx = serverCtx()
    if (!ctx) return
    return ctx.sdk.createClient({ directory, throwOnError: true })
  }

  const clientReady = createMemo(() => !!serverCtx() && directories().length > 0)

  const overviewQuery = useQuery(() => ({
    queryKey: ["stats", "overview", serverKey(), directories(), daysParam()],
    queryFn: async () => {
      const result = await Promise.all(
        directories().map(async (directory) => {
          const response = await createClient(directory)!.v2.stats.overview({ days: daysParam() })
          return response.data?.data as unknown as OverviewData
        }),
      )
      return mergeOverview(result)
    },
    enabled: clientReady(),
    placeholderData: (previousData) => previousData,
  }))

  const timeseriesQuery = useQuery(() => ({
    queryKey: ["stats", "timeseries", serverKey(), directories(), daysParam()],
    queryFn: async () => {
      const result = await Promise.all(
        directories().map(async (directory) => {
          const response = await createClient(directory)!.v2.stats.timeseries({ days: daysParam() })
          return (response.data?.data ?? []) as unknown as TimeseriesPoint[]
        }),
      )
      return mergeTimeseries(result)
    },
    enabled: clientReady(),
    placeholderData: (previousData) => previousData,
  }))

  const byModelQuery = useQuery(() => ({
    queryKey: ["stats", "byModel", serverKey(), directories(), daysParam()],
    queryFn: async () => {
      const result = await Promise.all(
        directories().map(async (directory) => {
          const response = await createClient(directory)!.v2.stats.byModel({ days: daysParam() })
          return (response.data?.data ?? []) as unknown as ByModelItem[]
        }),
      )
      return mergeByModel(result)
    },
    enabled: clientReady(),
    placeholderData: (previousData) => previousData,
  }))

  const byAgentQuery = useQuery(() => ({
    queryKey: ["stats", "byAgent", serverKey(), directories(), daysParam()],
    queryFn: async () => {
      const result = await Promise.all(
        directories().map(async (directory) => {
          const response = await createClient(directory)!.v2.stats.byAgent({ days: daysParam() })
          return (response.data?.data ?? []) as unknown as ByAgentItem[]
        }),
      )
      return mergeByAgent(result)
    },
    enabled: clientReady(),
    placeholderData: (previousData) => previousData,
  }))

  const tokenBreakdown = createMemo<DonutDatum[]>(() => {
    const o = overviewQuery.data
    if (!o) return []
    return TOKEN_CATEGORY_KEYS.map((key) => ({
      label: TOKEN_CATEGORY_LABELS[key],
      value: num(o.total_tokens[key]),
      color: TOKEN_CATEGORY_COLORS[key],
    })).filter((d) => d.value > 0)
  })

  const modelBreakdown = createMemo<DonutDatum[]>(() => {
    const data = byModelQuery.data ?? []
    return costBreakdown(data, state.costGroup === "model" ? "modelID" : "providerID")
  })

  const agentBreakdown = createMemo<DonutDatum[]>(() => {
    const data = byAgentQuery.data ?? []
    return data.slice(0, 6).map((item, i) => ({
      label: item.agent ?? "default",
      value: num(item.cost),
      color: costDonutColor(i),
    }))
  })

  const loading = createMemo(() => !overviewQuery.data && (overviewQuery.isLoading || timeseriesQuery.isLoading))

  return (
    <div class="flex flex-col gap-4 rounded-[10px] bg-v2-background-bg-layer-01 p-4 [box-shadow:inset_0_0_0_0.5px_var(--v2-border-border-muted)]">
      <div class="flex items-center justify-between">
        <h2 class="text-sm text-v2-text-text-base [font-weight:530]">Usage & Insights</h2>
        <div class="flex items-center gap-2">
          <div class="flex rounded-[6px] bg-v2-background-bg-layer-02 p-0.5">
            <For each={[7, 30, 90, 0] as const}>
              {(range) => (
                <button
                  type="button"
                  class="rounded-[4px] px-2 py-1 text-xs transition-colors"
                  classList={{
                    "bg-v2-background-bg-layer-04 text-v2-text-text-base": state.range === range,
                    "text-v2-text-text-muted hover:text-v2-text-text-base": state.range !== range,
                  }}
                  onClick={() => setState("range", range)}
                >
                  {range === 0 ? "All" : `${range}d`}
                </button>
              )}
            </For>
          </div>
        </div>
      </div>

      <Show
        when={!loading() && overviewQuery.data}
        fallback={
          <div class="flex items-center justify-center py-12">
            <Spinner class="size-5" />
          </div>
        }
      >
        {(overview) => (
          <>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label="Total Cost" value={formatCost(num(overview().total_cost))} />
              <StatCard label="Total Tokens" value={formatNumber(totalTokens(overview().total_tokens))} />
              <StatCard label="Sessions" value={formatNumber(num(overview().total_sessions))} />
              <StatCard label="Messages" value={formatNumber(num(overview().total_messages))} />
              <StatCard label="Cache Read" value={formatNumber(num(overview().total_tokens.cache_read))} />
              <StatCard label="Cache Write" value={formatNumber(num(overview().total_tokens.cache_write))} />
            </div>

            <div class="rounded-[8px] bg-v2-background-bg-base p-3 [box-shadow:inset_0_0_0_0.5px_var(--v2-border-border-muted)]">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-xs text-v2-text-text-muted [font-weight:530]">
                  {state.mode === "cost" ? "Daily Cost" : "Daily Token Usage"}
                </span>
                <div class="flex rounded-[6px] bg-v2-background-bg-layer-02 p-0.5">
                  <button
                    type="button"
                    class="rounded-[4px] px-2 py-0.5 text-xs transition-colors"
                    classList={{
                      "bg-v2-background-bg-layer-04 text-v2-text-text-base": state.mode === "cost",
                      "text-v2-text-text-muted hover:text-v2-text-text-base": state.mode !== "cost",
                    }}
                    onClick={() => setState("mode", "cost")}
                  >
                    Cost
                  </button>
                  <button
                    type="button"
                    class="rounded-[4px] px-2 py-0.5 text-xs transition-colors"
                    classList={{
                      "bg-v2-background-bg-layer-04 text-v2-text-text-base": state.mode === "tokens",
                      "text-v2-text-text-muted hover:text-v2-text-text-base": state.mode !== "tokens",
                    }}
                    onClick={() => setState("mode", "tokens")}
                  >
                    Tokens
                  </button>
                </div>
              </div>
              <UsageAreaChart data={(timeseriesQuery.data ?? []) as TimeseriesPoint[]} mode={state.mode} />
              <Show when={state.mode === "tokens"}>
                <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  <For each={TOKEN_CATEGORY_KEYS}>
                    {(key) => (
                      <div class="flex items-center gap-1.5 text-xs text-v2-text-text-muted">
                        <span class="size-2 rounded-full" style={{ background: TOKEN_CATEGORY_COLORS[key] }} />
                        {TOKEN_CATEGORY_LABELS[key]}
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <DonutCard title="Token Breakdown" data={tokenBreakdown()} formatValue={formatNumber} />
              <DonutCard
                title={state.costGroup === "model" ? "Cost by Model" : "Cost by Provider"}
                data={modelBreakdown()}
                formatValue={formatCostShort}
                actions={
                  <div class="flex rounded-[6px] bg-v2-background-bg-layer-02 p-0.5">
                    <button
                      type="button"
                      class="rounded-[4px] px-2 py-0.5 text-xs transition-colors"
                      classList={{
                        "bg-v2-background-bg-layer-04 text-v2-text-text-base": state.costGroup === "model",
                        "text-v2-text-text-muted hover:text-v2-text-text-base": state.costGroup !== "model",
                      }}
                      onClick={() => setState("costGroup", "model")}
                    >
                      Model
                    </button>
                    <button
                      type="button"
                      class="rounded-[4px] px-2 py-0.5 text-xs transition-colors"
                      classList={{
                        "bg-v2-background-bg-layer-04 text-v2-text-text-base": state.costGroup === "provider",
                        "text-v2-text-text-muted hover:text-v2-text-text-base": state.costGroup !== "provider",
                      }}
                      onClick={() => setState("costGroup", "provider")}
                    >
                      Provider
                    </button>
                  </div>
                }
              />
              <DonutCard title="Cost by Agent" data={agentBreakdown()} formatValue={formatCostShort} />
            </div>
          </>
        )}
      </Show>
    </div>
  )
}

function StatCard(props: { label: string; value: string }) {
  return (
    <div class="flex flex-col gap-0.5 rounded-[6px] bg-v2-background-bg-base px-3 py-2 [box-shadow:inset_0_0_0_0.5px_var(--v2-border-border-muted)]">
      <span class="text-xs text-v2-text-text-faint [font-weight:440]">{props.label}</span>
      <span class="text-base text-v2-text-text-base [font-weight:530]">{props.value}</span>
    </div>
  )
}

function DonutCard(props: { title: string; data: DonutDatum[]; formatValue: (v: number) => string; actions?: JSX.Element }) {
  return (
    <div class="flex flex-col gap-3 rounded-[8px] bg-v2-background-bg-base p-3 [box-shadow:inset_0_0_0_0.5px_var(--v2-border-border-muted)]">
      <div class="flex min-w-0 items-center justify-between gap-2">
        <span class="min-w-0 truncate text-xs text-v2-text-text-muted [font-weight:530]">{props.title}</span>
        {props.actions}
      </div>
      <UsageDonutChart data={props.data} formatValue={props.formatValue} />
    </div>
  )
}

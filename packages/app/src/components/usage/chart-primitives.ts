export const CHART_COLORS = {
  input: "#7698fd",
  output: "#49c970",
  reasoning: "#ff8648",
  cache_read: "#9e99f7",
  cache_write: "#f26cb2",
  cost: "#00c5df",
  costCumulative: "#f6c251",
}

export const TOKEN_CATEGORY_KEYS = ["input", "output", "reasoning", "cache_read", "cache_write"] as const
export type TokenCategoryKey = (typeof TOKEN_CATEGORY_KEYS)[number]

export const TOKEN_CATEGORY_LABELS: Record<TokenCategoryKey, string> = {
  input: "Input",
  output: "Output",
  reasoning: "Reasoning",
  cache_read: "Cache Read",
  cache_write: "Cache Write",
}

export const TOKEN_CATEGORY_COLORS: Record<TokenCategoryKey, string> = {
  input: CHART_COLORS.input,
  output: CHART_COLORS.output,
  reasoning: CHART_COLORS.reasoning,
  cache_read: CHART_COLORS.cache_read,
  cache_write: CHART_COLORS.cache_write,
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

export function formatCost(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`
  return `$${n.toFixed(4)}`
}

export function formatCostShort(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`
  if (n >= 1) return `$${n.toFixed(2)}`
  return `$${n.toFixed(3)}`
}

import { Location } from "@opencode-ai/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { LocationQuery, locationQueryOpenApi } from "./location"

export const StatsQuery = Schema.Struct({
  ...LocationQuery.fields,
  days: Schema.optional(Schema.NumberFromString),
})

export const StatsOverviewResult = Schema.Struct({
  total_sessions: Schema.Number,
  total_messages: Schema.Number,
  total_cost: Schema.Number,
  total_tokens: Schema.Struct({
    input: Schema.Number,
    output: Schema.Number,
    reasoning: Schema.Number,
    cache_read: Schema.Number,
    cache_write: Schema.Number,
  }),
  date_range: Schema.Struct({
    earliest: Schema.Number,
    latest: Schema.Number,
  }),
})

export const StatsTimeseriesPoint = Schema.Struct({
  date: Schema.String,
  cost: Schema.Number,
  tokens: Schema.Struct({
    input: Schema.Number,
    output: Schema.Number,
    reasoning: Schema.Number,
    cache_read: Schema.Number,
    cache_write: Schema.Number,
  }),
  sessions: Schema.Number,
})

export const StatsByModelResult = Schema.Struct({
  model: Schema.String,
  providerID: Schema.String,
  modelID: Schema.String,
  sessions: Schema.Number,
  messages: Schema.Number,
  cost: Schema.Number,
  tokens: Schema.Struct({
    input: Schema.Number,
    output: Schema.Number,
    reasoning: Schema.Number,
    cache_read: Schema.Number,
    cache_write: Schema.Number,
  }),
})

export const StatsByAgentResult = Schema.Struct({
  agent: Schema.String,
  sessions: Schema.Number,
  cost: Schema.Number,
  tokens: Schema.Struct({
    input: Schema.Number,
    output: Schema.Number,
    reasoning: Schema.Number,
    cache_read: Schema.Number,
    cache_write: Schema.Number,
  }),
})

export const StatsGroup = HttpApiGroup.make("server.stats").add(
  HttpApiEndpoint.get("stats.overview", "/api/stats/overview", {
    query: StatsQuery,
    success: Location.response(StatsOverviewResult),
  })
    .annotateMerge(locationQueryOpenApi)
    .annotateMerge(
      OpenApi.annotations({
        identifier: "v2.stats.overview",
        summary: "Get usage overview",
        description: "Aggregate token usage and cost statistics across all sessions.",
      }),
    ),
  HttpApiEndpoint.get("stats.timeseries", "/api/stats/timeseries", {
    query: StatsQuery,
    success: Location.response(Schema.Array(StatsTimeseriesPoint)),
  })
    .annotateMerge(locationQueryOpenApi)
    .annotateMerge(
      OpenApi.annotations({
        identifier: "v2.stats.timeseries",
        summary: "Get usage timeseries",
        description: "Daily breakdown of tokens and cost, filterable by number of days.",
      }),
    ),
  HttpApiEndpoint.get("stats.byModel", "/api/stats/by-model", {
    query: StatsQuery,
    success: Location.response(Schema.Array(StatsByModelResult)),
  })
    .annotateMerge(locationQueryOpenApi)
    .annotateMerge(
      OpenApi.annotations({
        identifier: "v2.stats.byModel",
        summary: "Get usage by model",
        description: "Breakdown of tokens and cost by model.",
      }),
    ),
  HttpApiEndpoint.get("stats.byAgent", "/api/stats/by-agent", {
    query: StatsQuery,
    success: Location.response(Schema.Array(StatsByAgentResult)),
  })
    .annotateMerge(locationQueryOpenApi)
    .annotateMerge(
      OpenApi.annotations({
        identifier: "v2.stats.byAgent",
        summary: "Get usage by agent",
        description: "Breakdown of tokens and cost by agent.",
      }),
    ),
)

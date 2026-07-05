import { Database } from "@opencode-ai/core/database/database"
import { Location } from "@opencode-ai/core/location"
import { sql } from "drizzle-orm"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

type StatsQuery = { readonly days?: number }
const ALL_TIME_TIMESERIES_LIMIT = 365
const ALL_TIME_TIMESERIES_BY_MODEL_LIMIT = 2048
const MODEL_BREAKDOWN_LIMIT = 64
const AGENT_BREAKDOWN_LIMIT = 6

function timeCondition(days: number | undefined) {
  if (!days || days <= 0) return sql.empty()
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return sql`AND s.time_updated >= ${cutoff}`
}

function allTimeTimeseriesLimit(days: number | undefined) {
  if (days && days > 0) return sql.empty()
  return sql`LIMIT ${ALL_TIME_TIMESERIES_LIMIT}`
}

function allTimeTimeseriesByModelLimit(days: number | undefined) {
  if (days && days > 0) return sql.empty()
  return sql`LIMIT ${ALL_TIME_TIMESERIES_BY_MODEL_LIMIT}`
}

export const StatsHandler = HttpApiBuilder.group(Api, "server.stats", (handlers) =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    return handlers
      .handle(
        "stats.overview",
        Effect.fn(function* (ctx: { query: StatsQuery }) {
          const location = yield* Location.Service
          const dir = location.directory
          const timeClause = timeCondition(ctx.query.days)
          const row = yield* db
            .get<{
              total_sessions: number
              total_cost: number
              total_input: number
              total_output: number
              total_reasoning: number
              total_cache_read: number
              total_cache_write: number
              earliest: number
              latest: number
            }>(
              sql`
              SELECT
                COUNT(*) as total_sessions,
                COALESCE(SUM(s.cost), 0) as total_cost,
                COALESCE(SUM(s.tokens_input), 0) as total_input,
                COALESCE(SUM(s.tokens_output), 0) as total_output,
                COALESCE(SUM(s.tokens_reasoning), 0) as total_reasoning,
                COALESCE(SUM(s.tokens_cache_read), 0) as total_cache_read,
                COALESCE(SUM(s.tokens_cache_write), 0) as total_cache_write,
                COALESCE(MIN(s.time_created), 0) as earliest,
                COALESCE(MAX(s.time_created), 0) as latest
              FROM session s
              WHERE s.directory = ${dir} ${timeClause}
            `,
            )
            .pipe(Effect.orDie)

          const messageCount = yield* db
            .get<{ count: number }>(
              sql`
              SELECT COUNT(*) as count FROM message m
              JOIN session s ON s.id = m.session_id
              WHERE s.directory = ${dir} ${timeClause}
            `,
            )
            .pipe(Effect.orDie)

          return yield* response(
            Effect.succeed({
              total_sessions: row?.total_sessions ?? 0,
              total_messages: messageCount?.count ?? 0,
              total_cost: row?.total_cost ?? 0,
              total_tokens: {
                input: row?.total_input ?? 0,
                output: row?.total_output ?? 0,
                reasoning: row?.total_reasoning ?? 0,
                cache_read: row?.total_cache_read ?? 0,
                cache_write: row?.total_cache_write ?? 0,
              },
              date_range: {
                earliest: row?.earliest ?? 0,
                latest: row?.latest ?? 0,
              },
            }),
          )
        }),
      )
      .handle(
        "stats.timeseries",
        Effect.fn(function* (ctx: { query: StatsQuery }) {
          const location = yield* Location.Service
          const dir = location.directory
          const timeClause = timeCondition(ctx.query.days)
          const limitClause = allTimeTimeseriesLimit(ctx.query.days)
          const rows = yield* db
            .all<{
              date: string
              cost: number
              total_input: number
              total_output: number
              total_reasoning: number
              total_cache_read: number
              total_cache_write: number
              sessions: number
            }>(
              sql`
            WITH daily AS (
              SELECT
                date(s.time_updated / 1000, 'unixepoch') as date,
                COALESCE(SUM(s.cost), 0) as cost,
                COALESCE(SUM(s.tokens_input), 0) as total_input,
                COALESCE(SUM(s.tokens_output), 0) as total_output,
                COALESCE(SUM(s.tokens_reasoning), 0) as total_reasoning,
                COALESCE(SUM(s.tokens_cache_read), 0) as total_cache_read,
                COALESCE(SUM(s.tokens_cache_write), 0) as total_cache_write,
                COUNT(*) as sessions
              FROM session s
              WHERE s.directory = ${dir} ${timeClause}
              GROUP BY date
              ORDER BY date DESC
              ${limitClause}
            )
            SELECT * FROM daily ORDER BY date ASC
          `,
            )
            .pipe(Effect.orDie)

          const result = (rows ?? []).map((r) => ({
            date: r.date,
            cost: r.cost ?? 0,
            tokens: {
              input: r.total_input ?? 0,
              output: r.total_output ?? 0,
              reasoning: r.total_reasoning ?? 0,
              cache_read: r.total_cache_read ?? 0,
              cache_write: r.total_cache_write ?? 0,
            },
            sessions: r.sessions ?? 0,
          }))
          return yield* response(Effect.succeed(result))
        }),
      )
      .handle(
        "stats.byModel",
        Effect.fn(function* (ctx: { query: StatsQuery }) {
          const location = yield* Location.Service
          const dir = location.directory
          const timeClause = timeCondition(ctx.query.days)
          const rows = yield* db
            .all<{
              model_data: string | null
              sessions: number
              messages: number
              cost: number
              total_input: number
              total_output: number
              total_reasoning: number
              total_cache_read: number
              total_cache_write: number
            }>(
              sql`
            WITH session_stats AS (
              SELECT
                s.model as model_data,
                COUNT(*) as sessions,
                COALESCE(SUM(s.cost), 0) as cost,
                COALESCE(SUM(s.tokens_input), 0) as total_input,
                COALESCE(SUM(s.tokens_output), 0) as total_output,
                COALESCE(SUM(s.tokens_reasoning), 0) as total_reasoning,
                COALESCE(SUM(s.tokens_cache_read), 0) as total_cache_read,
                COALESCE(SUM(s.tokens_cache_write), 0) as total_cache_write
              FROM session s
              WHERE s.directory = ${dir} AND s.model IS NOT NULL ${timeClause}
              GROUP BY s.model
            ),
            message_stats AS (
              SELECT
                s.model as model_data,
                COUNT(m.id) as messages
              FROM session s
              LEFT JOIN message m ON m.session_id = s.id
              WHERE s.directory = ${dir} AND s.model IS NOT NULL ${timeClause}
              GROUP BY s.model
            )
            SELECT
              session_stats.model_data,
              session_stats.sessions,
              COALESCE(message_stats.messages, 0) as messages,
              session_stats.cost,
              session_stats.total_input,
              session_stats.total_output,
              session_stats.total_reasoning,
              session_stats.total_cache_read,
              session_stats.total_cache_write
            FROM session_stats
            LEFT JOIN message_stats ON message_stats.model_data = session_stats.model_data
            ORDER BY cost DESC
            LIMIT ${MODEL_BREAKDOWN_LIMIT}
          `,
            )
            .pipe(Effect.orDie)

          const result = (rows ?? []).map((r) => {
            let model: { id: string; providerID: string; variant?: string } | null = null
            try {
              model = r.model_data ? JSON.parse(r.model_data) : null
            } catch {
              /* ignore parse errors */
            }
            return {
              model: model ? `${model.providerID}/${model.id}` : "unknown",
              providerID: model?.providerID ?? "unknown",
              modelID: model?.id ?? "unknown",
              sessions: r.sessions ?? 0,
              messages: r.messages ?? 0,
              cost: r.cost ?? 0,
              tokens: {
                input: r.total_input ?? 0,
                output: r.total_output ?? 0,
                reasoning: r.total_reasoning ?? 0,
                cache_read: r.total_cache_read ?? 0,
                cache_write: r.total_cache_write ?? 0,
              },
            }
          })
          return yield* response(Effect.succeed(result))
        }),
      )
      .handle(
        "stats.timeseriesByModel",
        Effect.fn(function* (ctx: { query: StatsQuery }) {
          const location = yield* Location.Service
          const dir = location.directory
          const timeClause = timeCondition(ctx.query.days)
          const limitClause = allTimeTimeseriesByModelLimit(ctx.query.days)
          const rows = yield* db
            .all<{
              date: string
              model_data: string | null
              cost: number
              sessions: number
              total_input: number
              total_output: number
              total_reasoning: number
              total_cache_read: number
              total_cache_write: number
            }>(
              sql`
            WITH daily AS (
              SELECT
                date(s.time_updated / 1000, 'unixepoch') as date,
                s.model as model_data,
                COALESCE(SUM(s.cost), 0) as cost,
                COALESCE(SUM(s.tokens_input), 0) as total_input,
                COALESCE(SUM(s.tokens_output), 0) as total_output,
                COALESCE(SUM(s.tokens_reasoning), 0) as total_reasoning,
                COALESCE(SUM(s.tokens_cache_read), 0) as total_cache_read,
                COALESCE(SUM(s.tokens_cache_write), 0) as total_cache_write,
                COUNT(*) as sessions
              FROM session s
              WHERE s.directory = ${dir} ${timeClause}
              GROUP BY date, s.model
              ORDER BY date DESC, cost DESC
              ${limitClause}
            )
            SELECT * FROM daily ORDER BY date ASC, cost DESC
          `,
            )
            .pipe(Effect.orDie)

          const result = (rows ?? []).map((r) => {
            let model: { id: string; providerID: string; variant?: string } | null = null
            try {
              model = r.model_data ? JSON.parse(r.model_data) : null
            } catch {
              /* ignore parse errors */
            }
            return {
              date: r.date,
              model: model ? `${model.providerID}/${model.id}` : "unknown",
              providerID: model?.providerID ?? "unknown",
              modelID: model?.id ?? "unknown",
              cost: r.cost ?? 0,
              sessions: r.sessions ?? 0,
              tokens: {
                input: r.total_input ?? 0,
                output: r.total_output ?? 0,
                reasoning: r.total_reasoning ?? 0,
                cache_read: r.total_cache_read ?? 0,
                cache_write: r.total_cache_write ?? 0,
              },
            }
          })
          return yield* response(Effect.succeed(result))
        }),
      )
      .handle(
        "stats.byAgent",
        Effect.fn(function* (ctx: { query: StatsQuery }) {
          const location = yield* Location.Service
          const dir = location.directory
          const timeClause = timeCondition(ctx.query.days)
          const rows = yield* db
            .all<{
              agent: string
              sessions: number
              cost: number
              total_input: number
              total_output: number
              total_reasoning: number
              total_cache_read: number
              total_cache_write: number
            }>(
              sql`
            SELECT
              COALESCE(s.agent, 'default') as agent,
              COUNT(*) as sessions,
              COALESCE(SUM(s.cost), 0) as cost,
              COALESCE(SUM(s.tokens_input), 0) as total_input,
              COALESCE(SUM(s.tokens_output), 0) as total_output,
              COALESCE(SUM(s.tokens_reasoning), 0) as total_reasoning,
              COALESCE(SUM(s.tokens_cache_read), 0) as total_cache_read,
              COALESCE(SUM(s.tokens_cache_write), 0) as total_cache_write
            FROM session s
            WHERE s.directory = ${dir} ${timeClause}
            GROUP BY s.agent
            ORDER BY cost DESC
            LIMIT ${AGENT_BREAKDOWN_LIMIT}
          `,
            )
            .pipe(Effect.orDie)

          const result = (rows ?? []).map((r) => ({
            agent: r.agent ?? "default",
            sessions: r.sessions ?? 0,
            cost: r.cost ?? 0,
            tokens: {
              input: r.total_input ?? 0,
              output: r.total_output ?? 0,
              reasoning: r.total_reasoning ?? 0,
              cache_read: r.total_cache_read ?? 0,
              cache_write: r.total_cache_write ?? 0,
            },
          }))
          return yield* response(Effect.succeed(result))
        }),
      )
  }),
)

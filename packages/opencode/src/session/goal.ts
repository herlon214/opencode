import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { EventV2Bridge } from "@/event-v2-bridge"
import { eq, sql } from "drizzle-orm"
import { Effect, Layer, Context, Schema } from "effect"
import { Session } from "./session"
import { SessionID } from "./schema"

export const Status = Schema.Literals(["active", "paused", "blocked", "complete"])
export type Status = Schema.Schema.Type<typeof Status>

export const Info = Schema.Struct({
  objective: Schema.String,
  status: Status,
  tokens_used: Schema.Finite,
  time_used: Schema.Finite,
}).annotate({ identifier: "SessionGoal" })
export type Info = Schema.Schema.Type<typeof Info>

export interface Interface {
  readonly get: (sessionID: SessionID) => Effect.Effect<Info | undefined>
  readonly set: (sessionID: SessionID, objective: string) => Effect.Effect<void>
  readonly clear: (sessionID: SessionID) => Effect.Effect<void>
  readonly pause: (sessionID: SessionID) => Effect.Effect<void>
  readonly resume: (sessionID: SessionID) => Effect.Effect<void>
  readonly block: (sessionID: SessionID) => Effect.Effect<void>
  readonly complete: (sessionID: SessionID) => Effect.Effect<void>
  readonly accountTokens: (sessionID: SessionID, tokens: number) => Effect.Effect<void>
  readonly accountTime: (sessionID: SessionID, ms: number) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionGoal") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const events = yield* EventV2Bridge.Service

    const get = Effect.fn("SessionGoal.get")(function* (sessionID: SessionID) {
      const row = yield* db
        .select({
          goal_objective: SessionTable.goal_objective,
          goal_status: SessionTable.goal_status,
          goal_tokens_used: SessionTable.goal_tokens_used,
          goal_time_used: SessionTable.goal_time_used,
        })
        .from(SessionTable)
        .where(eq(SessionTable.id, sessionID))
        .get()
        .pipe(Effect.orDie)
      if (!row?.goal_objective || !row?.goal_status) return
      const status = Schema.decodeUnknownSync(Status)(row.goal_status)
      return {
        objective: row.goal_objective,
        status,
        tokens_used: row.goal_tokens_used,
        time_used: row.goal_time_used,
      }
    })

    const set = Effect.fn("SessionGoal.set")(function* (sessionID: SessionID, objective: string) {
      yield* db
        .update(SessionTable)
        .set({
          goal_objective: objective,
          goal_status: "active",
          goal_tokens_used: 0,
          goal_time_used: 0,
        })
        .where(eq(SessionTable.id, sessionID))
        .run()
        .pipe(Effect.orDie)
      yield* publishUpdated(sessionID)
    })

    const clear = Effect.fn("SessionGoal.clear")(function* (sessionID: SessionID) {
      yield* db
        .update(SessionTable)
        .set({
          goal_objective: null,
          goal_status: null,
          goal_tokens_used: 0,
          goal_time_used: 0,
        })
        .where(eq(SessionTable.id, sessionID))
        .run()
        .pipe(Effect.orDie)
      yield* publishUpdated(sessionID)
    })

    const pause = Effect.fn("SessionGoal.pause")(function* (sessionID: SessionID) {
      yield* db
        .update(SessionTable)
        .set({ goal_status: "paused" })
        .where(eq(SessionTable.id, sessionID))
        .run()
        .pipe(Effect.orDie)
      yield* publishUpdated(sessionID)
    })

    const resume = Effect.fn("SessionGoal.resume")(function* (sessionID: SessionID) {
      yield* db
        .update(SessionTable)
        .set({ goal_status: "active" })
        .where(eq(SessionTable.id, sessionID))
        .run()
        .pipe(Effect.orDie)
      yield* publishUpdated(sessionID)
    })

    const block = Effect.fn("SessionGoal.block")(function* (sessionID: SessionID) {
      yield* db
        .update(SessionTable)
        .set({ goal_status: "blocked" })
        .where(eq(SessionTable.id, sessionID))
        .run()
        .pipe(Effect.orDie)
      yield* publishUpdated(sessionID)
    })

    const complete = Effect.fn("SessionGoal.complete")(function* (sessionID: SessionID) {
      yield* db
        .update(SessionTable)
        .set({ goal_status: "complete" })
        .where(eq(SessionTable.id, sessionID))
        .run()
        .pipe(Effect.orDie)
      yield* publishUpdated(sessionID)
    })

    const accountTokens = Effect.fn("SessionGoal.accountTokens")(function* (sessionID: SessionID, tokens: number) {
      yield* db
        .update(SessionTable)
        .set({ goal_tokens_used: sql`${SessionTable.goal_tokens_used} + ${tokens}` })
        .where(eq(SessionTable.id, sessionID))
        .run()
        .pipe(Effect.orDie)
      yield* publishUpdated(sessionID)
    })

    const accountTime = Effect.fn("SessionGoal.accountTime")(function* (sessionID: SessionID, ms: number) {
      yield* db
        .update(SessionTable)
        .set({ goal_time_used: sql`${SessionTable.goal_time_used} + ${ms}` })
        .where(eq(SessionTable.id, sessionID))
        .run()
        .pipe(Effect.orDie)
      yield* publishUpdated(sessionID)
    })

    function publishUpdated(sessionID: SessionID) {
      return Effect.gen(function* () {
        const row = yield* db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get().pipe(Effect.orDie)
        if (!row) return
        yield* events.publish(Session.Event.Updated, { sessionID, info: Session.fromRow(row) })
      })
    }

    return Service.of({ get, set, clear, pause, resume, block, complete, accountTokens, accountTime })
  }),
)

export const node = LayerNode.make({ service: Service, layer, deps: [Database.node, EventV2Bridge.node] })

export * as SessionGoal from "./goal"

import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionID } from "./schema"
import { Effect, Layer, Context } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { eq, and } from "drizzle-orm"
import { asc } from "drizzle-orm"
import { PlanCommentTable } from "@opencode-ai/core/session/sql"
import { EventV2Bridge } from "@/event-v2-bridge"
import { SessionPlanComment } from "@opencode-ai/schema/session-plan-comment"

export const Info = SessionPlanComment.Info
export type Info = SessionPlanComment.Info
export const ID = SessionPlanComment.ID
export type ID = SessionPlanComment.ID
export const Event = SessionPlanComment.Event

export interface Interface {
  readonly add: (input: {
    sessionID: SessionID
    line: number
    text: string
    author?: string
  }) => Effect.Effect<Info>
  readonly remove: (input: { sessionID: SessionID; commentID: string }) => Effect.Effect<void>
  readonly list: (sessionID: SessionID) => Effect.Effect<Info[]>
  readonly clear: (sessionID: SessionID) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionPlanComment") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service
    const { db } = yield* Database.Service

    const add = Effect.fn("PlanComment.add")(function* (input: {
      sessionID: SessionID
      line: number
      text: string
      author?: string
    }) {
      const id = SessionPlanComment.ID.create()
      const created = Date.now()
      yield* db
        .insert(PlanCommentTable)
        .values({
          id,
          session_id: input.sessionID,
          line: input.line,
          text: input.text,
          author: input.author,
          created,
          time_created: created,
          time_updated: created,
        })
        .run()
        .pipe(Effect.orDie)
      const info: Info = {
        id,
        sessionID: input.sessionID,
        line: input.line,
        text: input.text,
        author: input.author,
        created,
      }
      yield* events.publish(Event.Added, info)
      return info
    })

    const remove = Effect.fn("PlanComment.remove")(function* (input: {
      sessionID: SessionID
      commentID: string
    }) {
      yield* db
        .delete(PlanCommentTable)
        .where(
          and(
            eq(PlanCommentTable.id, input.commentID as SessionPlanComment.ID),
            eq(PlanCommentTable.session_id, input.sessionID),
          ),
        )
        .run()
        .pipe(Effect.orDie)
      yield* events.publish(Event.Removed, {
        sessionID: input.sessionID,
        commentID: input.commentID as SessionPlanComment.ID,
      })
    })

    const list = Effect.fn("PlanComment.list")(function* (sessionID: SessionID) {
      const rows = yield* db
        .select()
        .from(PlanCommentTable)
        .where(eq(PlanCommentTable.session_id, sessionID))
        .orderBy(asc(PlanCommentTable.line), asc(PlanCommentTable.created))
        .all()
        .pipe(Effect.orDie)
      return rows.map((row) => ({
        id: row.id as SessionPlanComment.ID,
        sessionID: row.session_id,
        line: row.line,
        text: row.text,
        author: row.author ?? undefined,
        created: row.created,
      }))
    })

    const clear = Effect.fn("PlanComment.clear")(function* (sessionID: SessionID) {
      yield* db
        .delete(PlanCommentTable)
        .where(eq(PlanCommentTable.session_id, sessionID))
        .run()
        .pipe(Effect.orDie)
      yield* events.publish(Event.Cleared, { sessionID })
    })

    return Service.of({ add, remove, list, clear })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [EventV2Bridge.node, Database.node],
})

export * as PlanComment from "./plan-comment"
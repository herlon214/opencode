import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer, Context, Option, Schema } from "effect"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Snapshot } from "../snapshot"
import { Storage } from "@/storage/storage"
import { Session } from "./session"
import { MessageV2 } from "./message-v2"
import { SessionID, MessageID, PartID } from "./schema"
import { SessionRunState } from "./run-state"
import { SessionSummary } from "./summary"

const decodeTaskSessionID = Schema.decodeUnknownOption(SessionID)

function createdTaskSessions(messages: SessionV1.WithParts[], revert: NonNullable<Session.Info["revert"]>) {
  const result = new Set<SessionID>()
  for (const message of messages) {
    if (message.info.id < revert.messageID) continue
    for (const part of message.parts) {
      if (message.info.id === revert.messageID && revert.partID && part.id < revert.partID) continue
      if (part.type !== "tool" || part.tool !== "task" || part.state.status === "pending") continue
      const sessionID = decodeTaskSessionID(part.state.metadata?.sessionId ?? part.state.metadata?.sessionID)
      if (Option.isNone(sessionID) || part.state.input.task_id === sessionID.value) continue
      result.add(sessionID.value)
    }
  }
  return result
}

export const RevertInput = Schema.Struct({
  sessionID: SessionID,
  messageID: MessageID,
  partID: Schema.optional(PartID),
})
export type RevertInput = Schema.Schema.Type<typeof RevertInput>

export interface Interface {
  readonly revert: (input: RevertInput) => Effect.Effect<Session.Info, Session.BusyError>
  readonly unrevert: (input: { sessionID: SessionID }) => Effect.Effect<Session.Info, Session.BusyError>
  readonly cleanup: (session: Session.Info) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionRevert") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const snap = yield* Snapshot.Service
    const storage = yield* Storage.Service
    const events = yield* EventV2Bridge.Service
    const summary = yield* SessionSummary.Service
    const state = yield* SessionRunState.Service

    const updateTasks = Effect.fn("SessionRevert.updateTasks")(function* (input: {
      sessionID: SessionID
      archive: ReadonlySet<SessionID>
      restore: ReadonlySet<SessionID>
    }) {
      for (const taskID of input.restore) {
        const task = yield* sessions.get(taskID).pipe(Effect.option)
        if (Option.isNone(task) || task.value.parentID !== input.sessionID || !task.value.time.archived) continue
        yield* sessions.setArchived({ sessionID: taskID })
      }
      for (const taskID of input.archive) {
        const task = yield* sessions.get(taskID).pipe(Effect.option)
        if (Option.isNone(task) || task.value.parentID !== input.sessionID || task.value.time.archived) continue
        yield* state.cancel(taskID)
        yield* sessions.setArchived({ sessionID: taskID, time: Date.now() })
      }
    })

    const revert = Effect.fn("SessionRevert.revert")(function* (input: RevertInput) {
      yield* state.assertNotBusy(input.sessionID)
      const all = yield* sessions.messages({ sessionID: input.sessionID }).pipe(Effect.orDie)
      let lastUser: SessionV1.User | undefined
      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)

      let rev: Session.Info["revert"]
      const patches: Snapshot.Patch[] = []
      for (const msg of all) {
        if (msg.info.role === "user") lastUser = msg.info
        const remaining = []
        for (const part of msg.parts) {
          if (rev) {
            if (part.type === "patch") patches.push(part)
            continue
          }

          if (!rev) {
            if ((msg.info.id === input.messageID && !input.partID) || part.id === input.partID) {
              const partID = remaining.some((item) => ["text", "tool"].includes(item.type)) ? input.partID : undefined
              rev = {
                messageID: !partID && lastUser ? lastUser.id : msg.info.id,
                partID,
              }
            }
            remaining.push(part)
          }
        }
      }

      if (!rev) return session

      rev.snapshot = session.revert?.snapshot ?? (yield* snap.track())
      if (session.revert?.snapshot) yield* snap.restore(session.revert.snapshot)
      yield* snap.revert(patches)
      if (rev.snapshot) rev.diff = yield* snap.diff(rev.snapshot)
      const range = all.filter((msg) => msg.info.id >= rev.messageID)
      const diffs = yield* summary.computeDiff({ messages: range })
      yield* storage.write(["session_diff", input.sessionID], diffs).pipe(Effect.ignore)
      yield* events.publish(Session.Event.Diff, { sessionID: input.sessionID, diff: diffs })
      yield* sessions.setRevert({
        sessionID: input.sessionID,
        revert: rev,
        summary: {
          additions: diffs.reduce((sum, x) => sum + x.additions, 0),
          deletions: diffs.reduce((sum, x) => sum + x.deletions, 0),
          files: diffs.length,
        },
      })
      const previousTasks = session.revert ? createdTaskSessions(all, session.revert) : new Set<SessionID>()
      const nextTasks = createdTaskSessions(all, rev)
      yield* updateTasks({
        sessionID: input.sessionID,
        archive: new Set([...nextTasks].filter((taskID) => !previousTasks.has(taskID))),
        restore: new Set([...previousTasks].filter((taskID) => !nextTasks.has(taskID))),
      })
      return yield* sessions.get(input.sessionID).pipe(Effect.orDie)
    })

    const unrevert = Effect.fn("SessionRevert.unrevert")(function* (input: { sessionID: SessionID }) {
      yield* Effect.logInfo("unreverting", { sessionID: input.sessionID })
      yield* state.assertNotBusy(input.sessionID)
      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
      if (!session.revert) return session
      const messages = yield* sessions.messages({ sessionID: input.sessionID }).pipe(Effect.orDie)
      if (session.revert.snapshot) yield* snap.restore(session.revert.snapshot)
      yield* sessions.clearRevert(input.sessionID)
      yield* updateTasks({
        sessionID: input.sessionID,
        archive: new Set(),
        restore: createdTaskSessions(messages, session.revert),
      })
      return yield* sessions.get(input.sessionID).pipe(Effect.orDie)
    })

    const cleanup = Effect.fn("SessionRevert.cleanup")(function* (session: Session.Info) {
      if (!session.revert) return
      const sessionID = session.id
      const msgs = yield* sessions.messages({ sessionID }).pipe(Effect.orDie)
      const messageID = session.revert.messageID
      for (const taskID of createdTaskSessions(msgs, session.revert)) {
        const task = yield* sessions.get(taskID).pipe(Effect.option)
        if (Option.isSome(task) && task.value.parentID === sessionID) yield* sessions.remove(taskID).pipe(Effect.ignore)
      }
      const remove = [] as SessionV1.WithParts[]
      let target: SessionV1.WithParts | undefined
      for (const msg of msgs) {
        if (msg.info.id < messageID) continue
        if (msg.info.id > messageID) {
          remove.push(msg)
          continue
        }
        if (session.revert.partID) {
          target = msg
          continue
        }
        remove.push(msg)
      }
      for (const msg of remove) {
        yield* sessions.removeMessage({ sessionID, messageID: msg.info.id })
      }
      if (session.revert.partID && target) {
        const partID = session.revert.partID
        const idx = target.parts.findIndex((part) => part.id === partID)
        if (idx >= 0) {
          const removeParts = target.parts.slice(idx)
          target.parts = target.parts.slice(0, idx)
          for (const part of removeParts) {
            yield* sessions.removePart({ sessionID, messageID: target.info.id, partID: part.id })
          }
        }
      }
      yield* sessions.clearRevert(sessionID)
    })

    return Service.of({ revert, unrevert, cleanup })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Session.node, Snapshot.node, Storage.node, EventV2Bridge.node, SessionSummary.node, SessionRunState.node],
})

export * as SessionRevert from "./revert"

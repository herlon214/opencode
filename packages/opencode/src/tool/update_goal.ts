import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { SessionGoal } from "@/session/goal"
import DESCRIPTION from "./update_goal.txt"

export const Parameters = Schema.Struct({
  status: Schema.Literals(["complete", "blocked"]),
  summary: Schema.String,
})

export type Params = Schema.Schema.Type<typeof Parameters>

export const UpdateGoalTool = Tool.define(
  "update_goal",
  Effect.gen(function* () {
    const goal = yield* SessionGoal.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (args: Params, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const current = yield* goal.get(ctx.sessionID)
          if (!current) {
            return {
              title: "No active goal",
              output: "There is no active goal for this session. Use /goal to set one.",
              metadata: {},
            }
          }

          if (args.status === "complete") {
            yield* goal.complete(ctx.sessionID)
            return {
              title: "Goal complete",
              output: `Goal marked as complete: ${current.objective}\n\nSummary: ${args.summary}`,
              metadata: {},
            }
          }

          yield* goal.block(ctx.sessionID)
          return {
            title: "Goal blocked",
            output: `Goal marked as blocked: ${current.objective}\n\nBlocker: ${args.summary}`,
            metadata: {},
          }
        }).pipe(Effect.orDie),
    }
  }),
)

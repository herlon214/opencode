import path from "path"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Question } from "../question"
import { Session } from "@/session/session"
import { PlanComment } from "@/session/plan-comment"
import { Provider } from "@/provider/provider"
import { Agent } from "@/agent/agent"
import { InstanceState } from "@/effect/instance-state"
import { MessageID, PartID } from "../session/schema"
import EXIT_DESCRIPTION from "./plan-exit.txt"

export const Parameters = Schema.Struct({})

const APPROVE_FRESH = "Approve & start fresh"
const APPROVE_PRESERVE = "Approve & keep context"
const REFINE = "Refine plan"

export const PlanExitTool = Tool.define(
  "plan_exit",
  Effect.gen(function* () {
    const session = yield* Session.Service
    const question = yield* Question.Service
    const provider = yield* Provider.Service
    const planComment = yield* PlanComment.Service
    const agents = yield* Agent.Service

    return {
      description: EXIT_DESCRIPTION,
      parameters: Parameters,
      execute: (_params: {}, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const info = yield* session.get(ctx.sessionID)
          const planAbs = Session.plan(info, instance)
          const plan = path.relative(instance.worktree, planAbs)

          const answers = yield* question.ask({
            sessionID: ctx.sessionID,
            questions: [
              {
                question: `Plan at ${plan} is complete. How would you like to proceed?`,
                header: "Plan approval",
                custom: false,
                options: [
                  {
                    label: APPROVE_FRESH,
                    description: "Start the build agent with a clean context. The plan file will be read from disk.",
                  },
                  {
                    label: APPROVE_PRESERVE,
                    description: "Start the build agent keeping the full planning context",
                  },
                  {
                    label: REFINE,
                    description: "Stay with the plan agent to continue refining the plan",
                  },
                ],
              },
            ],
            tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
          })

          const choice = answers[0]?.[0]
          if (choice === REFINE || !choice) yield* new Question.RejectedError()

          const mode: "fresh" | "preserve" = choice === APPROVE_PRESERVE ? "preserve" : "fresh"

          yield* session.updatePart({
            id: PartID.ascending(),
            messageID: ctx.messageID,
            sessionID: ctx.sessionID,
            type: "plan_approval",
            plan_path: plan,
            mode,
          } satisfies SessionV1.PlanApprovalPart)

          const buildAgent = yield* agents.get("build")
          const model = buildAgent?.model ?? (yield* provider.defaultModel().pipe(Effect.orDie))

          const msg: SessionV1.User = {
            id: MessageID.ascending(),
            sessionID: ctx.sessionID,
            role: "user",
            time: { created: Date.now() },
            agent: "build",
            model: { providerID: model.providerID, modelID: model.modelID },
          }
          yield* session.updateMessage(msg)

          const comments = yield* planComment.list(ctx.sessionID)
          const commentBlock =
            comments.length > 0
              ? `\n\n## Reviewer comments (address these during implementation):\n` +
                comments
                  .map((c) => `- Line ${c.line}: ${c.text}${c.author ? ` (${c.author})` : ""}`)
                  .join("\n")
              : ""

          const text =
            mode === "fresh"
              ? `The plan at ${plan} has been approved. You are starting with a clean context. Read the plan file at ${plan} first, then execute it.${commentBlock}`
              : `The plan at ${plan} has been approved, you can now edit files. Execute the plan.${commentBlock}`

          yield* session.updatePart({
            id: PartID.ascending(),
            messageID: msg.id,
            sessionID: ctx.sessionID,
            type: "text",
            text,
            synthetic: true,
          } satisfies SessionV1.TextPart)

          return {
            title: `Switching to build agent (${mode})`,
            output: "User approved switching to build agent. Wait for further instructions.",
            metadata: { mode },
          }
        }).pipe(Effect.orDie),
    }
  }),
)

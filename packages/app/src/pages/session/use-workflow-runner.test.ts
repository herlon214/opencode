import { beforeAll, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"

let createWorkflowRunner: typeof import("./use-workflow-runner").createWorkflowRunner
let workflows: Record<string, { description?: string; steps: import("./use-workflow-runner").WorkflowStep[] }> = {}

beforeAll(async () => {
  mock.module("@/context/sync", () => ({
    useSync: () => () => ({
      data: { config: { workflows } },
    }),
  }))

  ;({ createWorkflowRunner } = await import("./use-workflow-runner"))
})

test("queues configured commands as slash prompts", () => {
  workflows = {
    ship: {
      steps: [{ type: "command", command: "review" }],
    },
  }

  createRoot((dispose) => {
    const prompts: string[] = []
    const commands: string[] = []
    const workflow = createWorkflowRunner()

    workflow.start("ship", {
      sessionID: "session-1",
      queuePrompt: (text) => prompts.push(text),
      queueCommand: (command) => commands.push(command),
      isCommandPrompt: (command) => command === "review",
    })

    expect(prompts).toEqual(["/review"])
    expect(commands).toEqual([])
    dispose()
  })
})

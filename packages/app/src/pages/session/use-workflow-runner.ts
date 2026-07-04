import { createStore } from "solid-js/store"
import { useSync } from "@/context/sync"

export type WorkflowStep =
  | { type: "prompt"; text: string }
  | { type: "command"; command: string }
  | { type: "input"; placeholder?: string; description?: string }

export type WorkflowRun = {
  name: string
  description?: string
  steps: WorkflowStep[]
  current: number
}

type Input = {
  sessionID: string
  queuePrompt: (text: string) => void
  queueCommand: (command: string) => void
}

export function createWorkflowRunner() {
  const sync = useSync()
  const [store, setStore] = createStore<{
    active: Record<string, WorkflowRun | undefined>
  }>({
    active: {},
  })

  const start = (name: string, input: Input) => {
    const def = sync().data.config.workflows?.[name]
    if (!def || def.steps.length === 0) return
    setStore("active", input.sessionID, {
      name,
      description: def.description,
      steps: def.steps,
      current: 0,
    })
    queueStep(def.steps[0], input)
  }

  const queueStep = (step: WorkflowStep, input: Input) => {
    if (step.type === "prompt") input.queuePrompt(step.text)
    else if (step.type === "command") input.queueCommand(step.command)
  }

  const advance = (sessionID: string, input: Input) => {
    const run = store.active[sessionID]
    if (!run) return
    const next = run.current + 1
    if (next >= run.steps.length) {
      setStore("active", sessionID, undefined)
      return
    }
    setStore("active", sessionID, { ...run, current: next })
    queueStep(run.steps[next], input)
  }

  const cancel = (sessionID: string) => {
    setStore("active", sessionID, undefined)
  }

  const run = (sessionID: string) => store.active[sessionID]

  return { start, advance, cancel, run }
}
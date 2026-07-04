import { For, Show, createMemo } from "solid-js"
import { DockTray } from "@opencode-ai/ui/dock-surface"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { useLanguage } from "@/context/language"
import type { WorkflowStep } from "@/pages/session/use-workflow-runner"

export function SessionWorkflowDock(props: {
  name: string
  description?: string
  steps: WorkflowStep[]
  current: number
  onCancel: () => void
}) {
  const language = useLanguage()
  const total = createMemo(() => props.steps.length)

  const stepLabel = (step: WorkflowStep) => {
    if (step.type === "prompt") return step.text.slice(0, 60)
    if (step.type === "command") return `/${step.command}`
    return step.description ?? language.t("session.workflowDock.inputWaiting")
  }

  return (
    <DockTray
      data-component="session-workflow-dock"
      style={{
        "margin-bottom": "-0.875rem",
        "border-bottom-left-radius": 0,
        "border-bottom-right-radius": 0,
      }}
    >
      <div class="px-3 py-2 flex items-center gap-2">
        <span class="shrink-0 text-13-medium text-text-strong">
          {language.t("session.workflowDock.title", { name: props.name })}
        </span>
        <Show when={props.description}>
          <span class="min-w-0 flex-1 truncate text-13-regular text-text-base">{props.description}</span>
        </Show>
        <span class="shrink-0 text-13-regular text-text-weak">
          {language.t("session.workflowDock.progress", { current: props.current + 1, total: total() })}
        </span>
        <IconButton
          icon="close-small"
          size="small"
          variant="ghost"
          onClick={() => props.onCancel()}
          aria-label={language.t("session.workflowDock.cancel")}
        />
      </div>

      <div class="px-3 pb-3 flex flex-col gap-1">
        <For each={props.steps}>
          {(step, index) => {
            const status = createMemo(() => {
              if (index() < props.current) return "done"
              if (index() === props.current) return "active"
              return "pending"
            })

            return (
              <div class="flex items-center gap-2 min-w-0 py-0.5">
                <Show when={status() === "done"}>
                  <svg
                    viewBox="0 0 16 16"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    aria-hidden="true"
                    class="shrink-0 text-text-base"
                  >
                    <path d="M3 8l4 4 6-8" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </Show>
                <Show when={status() === "active"}>
                  <svg
                    viewBox="0 0 12 12"
                    width="12"
                    height="12"
                    fill="currentColor"
                    aria-hidden="true"
                    class="shrink-0 text-text-base"
                  >
                    <circle
                      cx="6"
                      cy="6"
                      r="3"
                      style={{
                        animation: "var(--animate-pulse-scale)",
                        "transform-origin": "center",
                        "transform-box": "fill-box",
                      }}
                    />
                  </svg>
                </Show>
                <Show when={status() === "pending"}>
                  <span class="shrink-0 w-3.5 h-3.5 rounded-full border border-border-weak-base" />
                </Show>
                <span
                  class="min-w-0 flex-1 truncate text-13-regular"
                  classList={{
                    "text-text-strong": status() === "active",
                    "text-text-base": status() === "done",
                    "text-text-weak": status() === "pending",
                  }}
                >
                  {stepLabel(step)}
                </span>
              </div>
            )
          }}
        </For>
      </div>
    </DockTray>
  )
}
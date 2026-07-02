import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Popover } from "@opencode-ai/ui/popover"
import { createMemo, createSignal, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { useSessionLayout } from "@/pages/session/session-layout"

function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function formatTokens(n: number) {
  if (n < 1000) return `${n}`
  return `${(n / 1000).toFixed(1)}K`
}

export function GoalPopover() {
  const language = useLanguage()
  const sync = useSync()
  const sdk = useSDK()
  const { params } = useSessionLayout()
  const [shown, setShown] = createSignal(false)
  const [editing, setEditing] = createSignal(false)
  const [draft, setDraft] = createSignal("")

  const goal = createMemo(() => {
    if (!params.id) return
    return sync().session.get(params.id)?.goal
  })

  const statusLabel = createMemo(() => {
    const g = goal()
    if (!g) return
    if (g.status === "active") return language.t("session.goal.active")
    if (g.status === "paused") return language.t("session.goal.paused")
    if (g.status === "blocked") return language.t("session.goal.blocked")
    if (g.status === "complete") return language.t("session.goal.complete")
  })

  const statusIcon = createMemo(() => {
    const g = goal()
    if (!g) return "bolt"
    if (g.status === "active") return "bolt"
    if (g.status === "paused") return "stop"
    if (g.status === "blocked") return "stop"
    return "circle-check"
  })

  const startEdit = () => {
    setDraft(goal()?.objective ?? "")
    setEditing(true)
  }

  const handlePause = async () => {
    if (!params.id) return
    await sdk().client.session.goal.pause({ sessionID: params.id })
  }

  const handleResume = async () => {
    if (!params.id) return
    await sdk().client.session.goal.resume({ sessionID: params.id })
  }

  const handleClear = async () => {
    if (!params.id) return
    await sdk().client.session.goal.clear({ sessionID: params.id })
    setShown(false)
  }

  const handleSave = async () => {
    if (!params.id) return
    const text = draft().trim()
    if (!text) return
    await sdk().client.session.goal.set({ sessionID: params.id, objective: text })
    setEditing(false)
  }

  return (
    <Show when={goal()}>
      {(g) => (
        <Popover
          open={shown()}
          onOpenChange={(v) => {
            setShown(v)
            if (!v) setEditing(false)
          }}
          triggerAs={Button}
          triggerProps={{
            variant: "ghost",
            class: "titlebar-icon h-6 px-2 box-border gap-1.5",
            "aria-label": statusLabel(),
          }}
          trigger={
            <>
              <Icon name={statusIcon()} size="small" />
              <span class="text-12-medium text-text-weak max-w-[120px] truncate">{g().objective}</span>
            </>
          }
          class="[&_[data-slot=popover-body]]:p-0 w-[320px] max-w-[calc(100vw-40px)] bg-transparent border-0 shadow-none rounded-xl"
          gutter={4}
          placement="bottom-end"
        >
          <Show when={shown()}>
            <div class="w-[320px] rounded-xl bg-background-strong shadow-[var(--shadow-lg-border-base)] p-4 flex flex-col gap-3">
              <Show
                when={editing()}
                fallback={
                  <>
                    <div class="flex flex-col gap-1">
                      <span class="text-12-medium text-text-weak">{statusLabel()}</span>
                      <span class="text-14-regular text-text-strong">{g().objective}</span>
                    </div>
                    <div class="flex items-center gap-3 text-12-regular text-text-weak">
                      <span>{formatTime(g().time_used)}</span>
                      <span>{formatTokens(g().tokens_used)} tokens</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <Button variant="ghost" size="small" onClick={startEdit}>
                        {language.t("session.goal.edit")}
                      </Button>
                      <Show
                        when={g().status === "active"}
                        fallback={
                          <Show when={g().status === "paused" || g().status === "blocked"}>
                            <Button variant="ghost" size="small" onClick={handleResume}>
                              {language.t("session.goal.resume")}
                            </Button>
                          </Show>
                        }
                      >
                        <Button variant="ghost" size="small" onClick={handlePause}>
                          {language.t("session.goal.pause")}
                        </Button>
                      </Show>
                      <Button variant="ghost" size="small" onClick={handleClear}>
                        {language.t("session.goal.clear")}
                      </Button>
                    </div>
                  </>
                }
              >
                <div class="flex flex-col gap-2">
                  <textarea
                    class="w-full rounded-lg bg-background-bg-base border border-border-weak-base p-2 text-14-regular text-text-strong resize-none focus:outline-none focus:border-border-active-base"
                    rows={3}
                    value={draft()}
                    onInput={(e) => setDraft(e.currentTarget.value)}
                    placeholder="Goal objective..."
                  />
                  <div class="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="small" onClick={() => setEditing(false)}>
                      {language.t("session.goal.cancel")}
                    </Button>
                    <Button variant="primary" size="small" onClick={handleSave} disabled={!draft().trim()}>
                      {language.t("session.goal.save")}
                    </Button>
                  </div>
                </div>
              </Show>
            </div>
          </Show>
        </Popover>
      )}
    </Show>
  )
}

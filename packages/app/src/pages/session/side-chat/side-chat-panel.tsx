import { Show, createMemo, createEffect, createSignal } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { useLocal } from "@/context/local"
import { useServerSync } from "@/context/server-sync"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useSettings } from "@/context/settings"
import { showToast } from "@/utils/toast"
import { Identifier } from "@/utils/id"
import { sendFollowupDraft } from "@/components/prompt-input/submit"
import { type Prompt } from "@/context/prompt"
import { formatServerError } from "@/utils/server-errors"
import { sessionTitle } from "@/utils/session-title"
import { SideChatTimeline } from "./side-chat-timeline"

const history: string[] = []
const MAX_HISTORY = 50

export function SideChatPanel() {
  const layout = useLayout()
  const language = useLanguage()
  const sdk = useSDK()
  const sync = useSync()
  const serverSync = useServerSync()
  const local = useLocal()
  const settings = useSettings()

  const sessionID = layout.sideChat.sessionID
  const [text, setText] = createSignal("")
  const [sending, setSending] = createSignal(false)
  let textareaRef: HTMLTextAreaElement | undefined
  let historyIndex = -1
  let draftBackup = ""

  const title = createMemo(() => {
    const id = sessionID()
    if (!id) return language.t("command.session.side")
    return sessionTitle(sync().session.get(id)?.title) ?? language.t("command.session.side")
  })

  const working = createMemo(() => {
    const id = sessionID()
    if (!id) return false
    return sync().data.session_working(id)
  })

  const ready = createMemo(() => {
    const id = sessionID()
    if (!id) return false
    return sync().data.message[id] !== undefined
  })

  const abort = () => {
    const id = sessionID()
    if (!id) return
    void sdk().client.session.abort({ sessionID: id }).catch(() => {})
  }

  const autoResize = () => {
    const el = textareaRef
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  const pushHistory = (value: string) => {
    if (history[0] !== value) {
      history.unshift(value)
      if (history.length > MAX_HISTORY) history.pop()
    }
    historyIndex = -1
    draftBackup = ""
  }

  const submit = () => {
    const id = sessionID()
    if (!id) return

    const value = text().trim()
    if (!value) return

    const currentModel = local.model.current()
    const currentAgent = local.agent.current()
    if (!currentModel || !currentAgent) {
      showToast({ title: language.t("prompt.toast.modelAgentRequired.title") })
      return
    }

    pushHistory(value)
    setSending(true)
    setText("")
    requestAnimationFrame(autoResize)

    void sendFollowupDraft({
      client: sdk().client,
      sync: sync(),
      serverSync: serverSync(),
      draft: {
        sessionID: id,
        sessionDirectory: sdk().directory,
        prompt: [{ type: "text", content: value, start: 0, end: value.length }] satisfies Prompt,
        context: [],
        agent: currentAgent.name,
        model: { providerID: currentModel.provider.id, modelID: currentModel.id },
        variant: local.model.variant.current(),
      },
      messageID: Identifier.ascending("message"),
      optimisticBusy: true,
    })
      .catch((err: unknown) => {
        setText(value)
        requestAnimationFrame(autoResize)
        showToast({
          title: language.t("common.requestFailed"),
          description: formatServerError(err, language.t),
        })
      })
      .finally(() => setSending(false))
  }

  const navigateHistory = (direction: 1 | -1) => {
    const el = textareaRef
    if (!el) return

    if (direction === 1) {
      if (history.length === 0) return
      if (el.selectionStart !== 0 || el.selectionEnd !== 0) return
      if (historyIndex === -1) draftBackup = text()
      historyIndex = Math.min(historyIndex + 1, history.length - 1)
    } else {
      if (historyIndex === -1) return
      historyIndex = Math.max(historyIndex - 1, -1)
    }

    setText(historyIndex === -1 ? draftBackup : history[historyIndex])
    requestAnimationFrame(() => {
      autoResize()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      if (!sending() && !working()) void submit()
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      navigateHistory(1)
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      navigateHistory(-1)
    }
  }

  createEffect(() => {
    if (sessionID() && textareaRef) {
      requestAnimationFrame(() => {
        textareaRef?.focus()
        autoResize()
      })
    }
  })

  return (
    <Show when={sessionID()} keyed>
      {(id) => (
        <aside
          class="relative h-full min-w-0 flex-1 flex flex-col overflow-hidden bg-background-base"
          classList={{
            "bg-v2-background-bg-base": settings.general.newLayoutDesigns(),
            "rounded-[10px] shadow-[var(--v2-elevation-raised)]": settings.general.newLayoutDesigns(),
            "border-l border-border-weaker-base": !settings.general.newLayoutDesigns(),
          }}
        >
          <div
            class="flex items-center justify-between px-3 py-2 shrink-0"
            classList={{
              "bg-v2-background-bg-base": settings.general.newLayoutDesigns(),
              "border-b border-border-weaker-base": !settings.general.newLayoutDesigns(),
            }}
          >
            <span class="text-12-medium text-text-weak truncate">{title()}</span>
            <IconButton
              icon="close-small"
              variant="ghost"
              class="h-5 w-5 shrink-0"
              onClick={() => layout.sideChat.close()}
              aria-label={language.t("common.closeTab")}
            />
          </div>

          <div class="flex-1 min-h-0">
            <Show
              when={ready()}
              fallback={
                <div class="flex h-full items-center justify-center text-12-regular text-text-weak">
                  {language.t("sideChat.loading")}
                </div>
              }
            >
              <Show
                when={(sync().data.message[id] ?? []).length > 0}
                fallback={
                  <div class="flex h-full items-center justify-center px-6 text-center text-13-regular text-text-weak">
                    {language.t("sideChat.empty")}
                  </div>
                }
              >
                <SideChatTimeline sessionID={() => id} />
              </Show>
            </Show>
          </div>

          <div
            class="shrink-0 p-2"
            classList={{
              "bg-v2-background-bg-base": settings.general.newLayoutDesigns(),
              "border-t border-border-weaker-base": !settings.general.newLayoutDesigns(),
            }}
          >
            <Show when={working()}>
              <button
                type="button"
                class="mb-2 w-full rounded-md border border-border-weak-base px-3 py-1.5 text-12-regular text-text-weak hover:text-text-base"
                onClick={abort}
              >
                {language.t("prompt.action.stop")}
              </button>
            </Show>
            <textarea
              ref={textareaRef}
              value={text()}
              onInput={(e) => {
                setText(e.currentTarget.value)
                autoResize()
              }}
              onKeyDown={onKeyDown}
              placeholder={language.t("prompt.placeholder.simple")}
              disabled={sending() || working()}
              class="w-full resize-none rounded-md border border-border-weak-base bg-background-base px-3 py-2 text-13-regular text-text-base placeholder:text-text-weak focus:outline-none disabled:opacity-50"
              rows={1}
            />
          </div>
        </aside>
      )}
    </Show>
  )
}

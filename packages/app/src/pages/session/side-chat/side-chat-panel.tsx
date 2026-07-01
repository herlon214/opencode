import { Show, createMemo } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { PromptInput } from "@/components/prompt-input"
import { useSync } from "@/context/sync"
import { useServerSync } from "@/context/server-sync"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useSettings } from "@/context/settings"
import { createPromptState } from "@/context/prompt"
import { createPromptInputController } from "@/pages/session/composer"
import { sessionTitle } from "@/utils/session-title"
import { SideChatTimeline } from "./side-chat-timeline"

export function SideChatPanel() {
  const layout = useLayout()
  const language = useLanguage()
  const sync = useSync()
  const serverSync = useServerSync()
  const settings = useSettings()

  const sessionID = layout.sideChat.sessionID
  const prompt = createPromptState()
  const inputController = createPromptInputController({
    sessionKey: () => `side:${sessionID() ?? ""}`,
    sessionID,
    queryOptions: serverSync().queryOptions,
  })

  const title = createMemo(() => {
    const id = sessionID()
    if (!id) return language.t("command.session.side")
    return sessionTitle(sync().session.get(id)?.title) ?? language.t("command.session.side")
  })

  const ready = createMemo(() => {
    const id = sessionID()
    if (!id) return false
    return sync().data.message[id] !== undefined
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
            class="shrink-0 px-3 pb-3"
            classList={{
              "bg-v2-background-bg-base": settings.general.newLayoutDesigns(),
              "border-t border-border-weaker-base": !settings.general.newLayoutDesigns(),
            }}
          >
            <PromptInput state={prompt} controls={inputController()} />
          </div>
        </aside>
      )}
    </Show>
  )
}

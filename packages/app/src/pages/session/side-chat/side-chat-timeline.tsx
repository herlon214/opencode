import { For, Show, createMemo, createEffect, onCleanup, onMount } from "solid-js"
import { Message } from "@opencode-ai/session-ui/message-part"
import { useSync } from "@/context/sync"
import { createTimelineModel } from "@/pages/session/timeline/model"
import { createAutoScroll } from "@opencode-ai/ui/hooks"
import { useLanguage } from "@/context/language"
import type { Accessor } from "solid-js"

export function SideChatTimeline(props: { sessionID: Accessor<string | undefined> }) {
  const sync = useSync()
  const language = useLanguage()
  const revertMessageID = createMemo(() => undefined as string | undefined)
  const timeline = createTimelineModel({ sessionID: props.sessionID, revertMessageID })
  const parts = (messageID: string) => sync().data.part[messageID] ?? []

  const autoScroll = createAutoScroll({ working: () => true, overflowAnchor: "none" })

  let sentinel: HTMLDivElement | undefined
  let scrollEl: HTMLDivElement | undefined

  onMount(() => {
    if (!sentinel || !scrollEl) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void timeline.history.loadOlder()
      },
      { root: scrollEl, rootMargin: "100px 0px 0px 0px" },
    )
    observer.observe(sentinel)
    onCleanup(() => observer.disconnect())
  })

  createEffect(() => {
    const count = timeline.messages().length
    if (count === 0) return
    requestAnimationFrame(() =>
      requestAnimationFrame(() => autoScroll.forceScrollToBottom()),
    )
  })

  return (
    <div
      ref={(el) => {
        scrollEl = el
        autoScroll.scrollRef(el)
      }}
      class="h-full overflow-y-auto"
      onScroll={autoScroll.handleScroll}
    >
      <div ref={(el) => (sentinel = el)} class="h-px" />
      <Show when={timeline.history.loading()}>
        <div class="py-2 text-center text-12-regular text-text-weak">
          {language.t("common.loading")}
          {language.t("common.loading.ellipsis")}
        </div>
      </Show>
      <For each={timeline.messages()}>
        {(message) => (
          <div class="px-3 py-1.5">
            <Message message={message} parts={parts(message.id)} />
          </div>
        )}
      </For>
    </div>
  )
}

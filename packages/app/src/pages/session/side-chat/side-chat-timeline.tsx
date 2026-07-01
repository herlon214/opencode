import { createAutoScroll } from "@opencode-ai/ui/hooks"
import { createEffect, createMemo, onCleanup, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { createTimelineModel } from "@/pages/session/timeline/model"
import { MessageTimeline } from "@/pages/session/timeline/message-timeline"

const scrollGestureWindowMs = 250

export function SideChatTimeline(props: { sessionID: Accessor<string | undefined> }) {
  const revertMessageID = createMemo(() => undefined as string | undefined)
  const timeline = createTimelineModel({ sessionID: props.sessionID, revertMessageID })
  const autoScroll = createAutoScroll({ working: () => true, overflowAnchor: "none" })
  const [ui, setUi] = createStore({
    scroll: { overflow: false, bottom: true, jump: false },
    scrollGesture: 0,
  })

  let scroller: HTMLDivElement | undefined
  let scrollStateFrame: number | undefined
  let scrollStateTarget: HTMLDivElement | undefined
  let captureHistoryAnchor = () => {}
  let restoreHistoryAnchor = (_done: boolean) => {}
  let scrollToEnd = () => {}

  const jumpThreshold = (el: HTMLDivElement) => Math.max(400, el.clientHeight)

  const updateScrollState = (el: HTMLDivElement) => {
    const max = el.scrollHeight - el.clientHeight
    const distance = max - el.scrollTop
    const overflow = max > 1
    const bottom = !overflow || distance <= 2
    const jump = overflow && distance > jumpThreshold(el)

    if (ui.scroll.overflow === overflow && ui.scroll.bottom === bottom && ui.scroll.jump === jump) return
    setUi("scroll", { overflow, bottom, jump })
  }

  const scheduleScrollState = (el: HTMLDivElement) => {
    scrollStateTarget = el
    if (scrollStateFrame !== undefined) return

    scrollStateFrame = requestAnimationFrame(() => {
      scrollStateFrame = undefined
      const target = scrollStateTarget
      scrollStateTarget = undefined
      if (target) updateScrollState(target)
    })
  }

  const resumeScroll = () => {
    autoScroll.resume()
    scrollToEnd()
    if (scroller) scheduleScrollState(scroller)
  }

  const setScrollRef = (el: HTMLDivElement | undefined) => {
    scroller = el
    autoScroll.scrollRef(el)
    if (el) scheduleScrollState(el)
  }

  const markScrollGesture = (target?: EventTarget | null) => {
    if (!scroller) return
    const el = target instanceof Element ? target : undefined
    const nested = el?.closest("[data-scrollable]")
    if (nested && nested !== scroller) return
    setUi("scrollGesture", Date.now())
  }

  const hasScrollGesture = () => Date.now() - ui.scrollGesture < scrollGestureWindowMs

  const loadOlder = async () => {
    const before = timeline.messages().length
    await timeline.history.loadOlder({ before: captureHistoryAnchor, after: restoreHistoryAnchor })
    if (timeline.messages().length <= before) return
    if (!autoScroll.userScrolled() || !scroller || scroller.scrollTop >= 200 || !timeline.history.more()) return
    requestAnimationFrame(onHistoryScroll)
  }

  const onHistoryScroll = () => {
    if (timeline.history.loading() || !autoScroll.userScrolled() || !scroller || scroller.scrollTop >= 200) return
    void loadOlder()
  }

  createEffect(() => {
    timeline.messages().length
    if (scroller) scheduleScrollState(scroller)
  })

  onCleanup(() => {
    if (scrollStateFrame !== undefined) cancelAnimationFrame(scrollStateFrame)
  })

  return (
    <>
      {timeline.resource() ?? ""}
      <MessageTimeline
        sessionID={props.sessionID}
        sessionKey={() => `side:${props.sessionID() ?? ""}`}
        showHeader={false}
        scroll={ui.scroll}
        onResumeScroll={resumeScroll}
        setScrollRef={setScrollRef}
        onScheduleScrollState={scheduleScrollState}
        onAutoScrollHandleScroll={autoScroll.handleScroll}
        onMarkScrollGesture={markScrollGesture}
        hasScrollGesture={hasScrollGesture}
        onUserScroll={() => {}}
        onHistoryScroll={onHistoryScroll}
        onAutoScrollInteraction={autoScroll.handleInteraction}
        shouldAnchorBottom={() => !autoScroll.userScrolled()}
        centered={false}
        setContentRef={(el) => {
          autoScroll.contentRef(el)
          if (scroller) scheduleScrollState(scroller)
        }}
        userMessages={timeline.visibleUserMessages()}
        setHistoryAnchor={(handlers) => {
          captureHistoryAnchor = handlers.capture
          restoreHistoryAnchor = handlers.restore
        }}
        anchor={(id) => `side-message-${id}`}
        setScrollToEnd={(fn) => {
          scrollToEnd = fn
        }}
      />
    </>
  )
}

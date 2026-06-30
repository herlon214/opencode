import { useLanguage } from "@/context/language"
import { usePrompt } from "@/context/prompt"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Icon } from "@opencode-ai/ui/icon"
import { onCleanup, onMount, Show, type JSX } from "solid-js"
import { Portal } from "solid-js/web"
import { createStore } from "solid-js/store"
import { Identifier } from "@/utils/id"

type Position = {
  left: number
  top: number
  placement: "above" | "below"
}

export function QuoteReply(props: { container: () => HTMLElement | undefined }): JSX.Element {
  const language = useLanguage()
  const prompt = usePrompt()
  let textarea: HTMLTextAreaElement | undefined
  const [state, setState] = createStore({
    mode: "idle" as "idle" | "button" | "editor",
    position: undefined as Position | undefined,
    text: "",
    draft: "",
  })
  let frame: number | undefined

  const readSelection = () => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (range.collapsed) return

    const startPart = closestTextPart(range.startContainer)
    const endPart = closestTextPart(range.endContainer)
    if (!startPart || startPart !== endPart) return

    const container = props.container()
    if (container && !container.contains(startPart)) return

    const content = selection.toString().trim()
    if (!content) return
    return { range, content }
  }

  const update = () => {
    frame = undefined
    if (state.mode === "editor") return
    const selection = readSelection()
    if (!selection) {
      hide()
      return
    }

    const rect = Array.from(selection.range.getClientRects()).find((item) => item.width > 0 || item.height > 0)
    const fallback = selection.range.getBoundingClientRect()
    const bounds = rect ?? fallback
    if (bounds.width === 0 && bounds.height === 0) {
      hide()
      return
    }

    setState({
      mode: "button",
      text: selection.content,
      position: positionFromRect(bounds),
    })
  }

  const hide = () => {
    setState({ mode: "idle", position: undefined, text: "", draft: "" })
  }

  const scheduleUpdate = () => {
    if (frame !== undefined) return
    frame = requestAnimationFrame(update)
  }

  onMount(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.defaultPrevented) return
      const target = event.target
      if (!(target instanceof Node)) return
      if (target instanceof Element && target.closest('[data-component="quote-reply"]')) return
      if (state.mode === "editor") return
      scheduleUpdate()
    }

    const onScroll = () => {
      if (state.mode === "editor") {
        hide()
        return
      }
      scheduleUpdate()
    }

    document.addEventListener("selectionchange", scheduleUpdate)
    document.addEventListener("pointerup", scheduleUpdate)
    document.addEventListener("keyup", scheduleUpdate)
    document.addEventListener("pointerdown", onPointerDown, { capture: true })
    document.addEventListener("scroll", onScroll, { capture: true })
    window.addEventListener("resize", scheduleUpdate)

    onCleanup(() => {
      document.removeEventListener("selectionchange", scheduleUpdate)
      document.removeEventListener("pointerup", scheduleUpdate)
      document.removeEventListener("keyup", scheduleUpdate)
      document.removeEventListener("pointerdown", onPointerDown, { capture: true })
      document.removeEventListener("scroll", onScroll, { capture: true })
      window.removeEventListener("resize", scheduleUpdate)
    })
  })

  onCleanup(() => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    hide()
  })

  const openEditor = () => {
    if (!state.text || !state.position) return
    window.getSelection()?.removeAllRanges()
    setState({ mode: "editor", draft: "" })
    requestAnimationFrame(() => textarea?.focus())
  }

  const submit = () => {
    const reply = state.draft.trim()
    if (!state.text || !reply) return
    prompt.set(
      [
        ...prompt.current(),
        {
          type: "quote-reply",
          id: Identifier.ascending("part"),
          quote: state.text,
          reply,
        },
      ],
      prompt.cursor(),
    )
    hide()
    requestAnimationFrame(() => {
      const editor = document.querySelector<HTMLDivElement>('[data-component="prompt-input"] [contenteditable="true"]')
      if (!editor) return
      editor.focus()
    })
  }

  return (
    <Portal>
      <Show when={state.mode === "button" && state.position} keyed>
        {(position) => (
          <button
            type="button"
            data-component="quote-reply"
            data-variant="trigger"
            data-placement={position.placement}
            style={{ left: `${position.left}px`, top: `${position.top}px` }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={openEditor}
          >
            <Icon name="comment" size="small" />
            <span>{language.t("session.quoteReply.label")}</span>
          </button>
        )}
      </Show>
      <Show when={state.mode === "editor" && state.position} keyed>
        {(position) => (
          <div
            data-component="quote-reply"
            data-variant="editor"
            data-placement={position.placement}
            role="dialog"
            aria-label={language.t("session.quoteReply.title")}
            style={{ left: `${position.left}px`, top: `${position.top}px` }}
          >
            <div data-slot="quote-reply-shell">
              <div data-slot="quote-reply-heading">
                <Icon name="comment" size="small" />
                <span>{language.t("session.quoteReply.title")}</span>
              </div>
              <div data-slot="quote-reply-excerpt">{state.text}</div>
              <textarea
                ref={(el) => {
                  textarea = el
                }}
                data-slot="quote-reply-textarea"
                rows={3}
                placeholder={language.t("session.quoteReply.placeholder")}
                value={state.draft}
                onInput={(event) => setState("draft", event.currentTarget.value)}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === "Escape") {
                    event.preventDefault()
                    hide()
                    return
                  }
                  if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return
                  event.preventDefault()
                  submit()
                }}
              />
              <div data-slot="quote-reply-footer">
                <span>{language.t("session.quoteReply.footer")}</span>
                <div data-slot="quote-reply-actions">
                  <ButtonV2 type="button" size="normal" variant="neutral" onClick={hide}>
                    {language.t("common.cancel")}
                  </ButtonV2>
                  <ButtonV2 type="button" size="normal" variant="contrast" disabled={!state.draft.trim()} onClick={submit}>
                    {language.t("session.quoteReply.add")}
                  </ButtonV2>
                </div>
              </div>
            </div>
          </div>
        )}
      </Show>
    </Portal>
  )
}

function closestTextPart(node: Node) {
  const element = node instanceof Element ? node : node.parentNode instanceof Element ? node.parentNode : undefined
  return element?.closest<HTMLElement>('[data-component="text-part"]')
}

function positionFromRect(rect: DOMRect): Position {
  const width = Math.min(360, window.innerWidth - 24)
  const padding = 12
  const left = Math.min(Math.max(rect.left + rect.width / 2, width / 2 + padding), window.innerWidth - width / 2 - padding)
  if (rect.top > 220) return { left, top: rect.top, placement: "above" }
  return { left, top: rect.bottom, placement: "below" }
}

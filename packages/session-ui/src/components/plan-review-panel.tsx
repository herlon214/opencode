import {
  Component,
  createMemo,
  createResource,
  createSignal,
  For,
  Show,
  type JSX,
} from "solid-js"
import { useI18n } from "@opencode-ai/ui/context/i18n"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { Markdown } from "./markdown"

export type PlanComment = {
  id: string
  sessionID: string
  line: number
  text: string
  author?: string
  created: number
}

export type PlanCommentActions = {
  add: (input: { line: number; text: string }) => Promise<void>
  remove: (commentID: string) => Promise<void>
  clear: () => Promise<void>
}

export type PlanReviewPanelProps = {
  planPath: string
  planContent?: string
  comments: PlanComment[]
  commentActions: PlanCommentActions
  readFile?: (path: string) => Promise<string | undefined>
}

type LineWithComments = {
  lineNumber: number
  text: string
  comments: PlanComment[]
}

export const PlanReviewPanel: Component<PlanReviewPanelProps> = (props) => {
  const i18n = useI18n()
  const [commentingLine, setCommentingLine] = createSignal<number | null>(null)
  const [commentText, setCommentText] = createSignal("")
  const [submitting, setSubmitting] = createSignal(false)

  const [fileContent] = createResource(
    () => props.planPath,
    async (path) => {
      if (props.planContent) return props.planContent
      if (!props.readFile) return undefined
      return props.readFile(path)
    },
  )

  const lines = createMemo(() => {
    const content = fileContent()
    if (!content) return [] as string[]
    return content.split("\n")
  })

  const commentsByLine = createMemo(() => {
    const map = new Map<number, PlanComment[]>()
    for (const comment of props.comments) {
      const list = map.get(comment.line)
      if (list) list.push(comment)
      else map.set(comment.line, [comment])
    }
    return map
  })

  const handleSubmit = async () => {
    const text = commentText().trim()
    const line = commentingLine()
    if (!text || line === null) return
    setSubmitting(true)
    try {
      await props.commentActions.add({ line, text })
      setCommentText("")
      setCommentingLine(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div data-component="plan-review-panel">
      <div data-slot="plan-review-header">
        <div data-slot="plan-review-title">
          <Icon name="open-file" size="small" />
          <span>{props.planPath}</span>
        </div>
        <Show when={props.comments.length > 0}>
          <button
            data-slot="plan-review-clear"
            type="button"
            onClick={() => void props.commentActions.clear()}
          >
            Clear all
          </button>
        </Show>
      </div>
      <ScrollView data-slot="plan-review-scroll">
        <Show
          when={!fileContent.loading}
          fallback={
            <div data-slot="plan-review-loading">
              <Spinner />
            </div>
          }
        >
          <div data-slot="plan-review-content">
            <For each={lines()}>
              {(lineText, index) => {
                const lineNo = index()
                const comments = createMemo(() => commentsByLine().get(lineNo) ?? [])
                const isCommenting = createMemo(() => commentingLine() === lineNo)
                return (
                  <div data-slot="plan-review-line" data-commented={comments().length > 0 ? "" : undefined}>
                    <div data-slot="plan-review-line-row">
                      <button
                        data-slot="plan-review-line-number"
                        type="button"
                        onClick={() =>
                          setCommentingLine(isCommenting() ? null : lineNo)
                        }
                        aria-label={`Comment on line ${lineNo + 1}`}
                      >
                        {lineNo + 1}
                      </button>
                      <span data-slot="plan-review-line-text">{lineText || "\u00A0"}</span>
                    </div>
                    <Show when={isCommenting()}>
                      <div data-slot="plan-review-comment-box">
                        <textarea
                          data-slot="plan-review-comment-input"
                          placeholder="Add a comment..."
                          value={commentText()}
                          onInput={(e) => setCommentText(e.currentTarget.value)}
                          rows={2}
                        />
                        <div data-slot="plan-review-comment-actions">
                          <button
                            data-slot="plan-review-comment-submit"
                            type="button"
                            disabled={submitting() || !commentText().trim()}
                            onClick={() => void handleSubmit()}
                          >
                            Comment
                          </button>
                          <button
                            data-slot="plan-review-comment-cancel"
                            type="button"
                            onClick={() => {
                              setCommentingLine(null)
                              setCommentText("")
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </Show>
                    <Show when={comments().length > 0}>
                      <div data-slot="plan-review-comments">
                        <For each={comments()}>
                          {(comment) => (
                            <div data-slot="plan-review-comment">
                              <div data-slot="plan-review-comment-header">
                                <Show when={comment.author}>
                                  <span data-slot="plan-review-comment-author">{comment.author}</span>
                                </Show>
                                <button
                                  data-slot="plan-review-comment-delete"
                                  type="button"
                                  onClick={() => void props.commentActions.remove(comment.id)}
                                  aria-label="Delete comment"
                                >
                                  <Icon name="trash" size="small" />
                                </button>
                              </div>
                              <div data-slot="plan-review-comment-text">{comment.text}</div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                )
              }}
            </For>
          </div>
        </Show>
      </ScrollView>
    </div>
  )
}
import { parseCommentNote, readCommentMetadata } from "@/utils/comment-note"
import { AssistantMessage, Part, SessionStatus, SnapshotFileDiff, UserMessage } from "@opencode-ai/sdk/v2"
import { groupParts, renderable, type PartGroup } from "@opencode-ai/session-ui/message-part"
import { reasoningHeading, textHeading } from "@opencode-ai/session-ui/message-part-reasoning"
import { TimelineRow, type SummaryDiff } from "./timeline-row"

export { TimelineRow, type SummaryDiff } from "./timeline-row"

export type TimelineRowMap = {
  TurnGap: { userMessageID: string }
  CommentStrip: {
    userMessageID: string
  }
  UserMessage: {
    userMessageID: string
    anchor: boolean
  }
  TurnDivider: {
    userMessageID: string
    label: "compaction" | "interrupted"
  }
  AssistantPart: {
    userMessageID: string
    group: PartGroup
    previousAssistantPart: boolean
    followsInProgress: boolean
  }
  InProgressGroup: {
    userMessageID: string
    groups: { type: "part"; group: PartGroup }[]
    previousAssistantPart: boolean
    active: boolean
    lastThoughtHeading?: string
    lastTextHeading?: string
  }
  Thinking: { userMessageID: string; reasoningHeading?: string; reasoningTokens: number }
  Retry: { userMessageID: string }
  DiffSummary: { userMessageID: string; diffs: SummaryDiff[] }
  Error: { userMessageID: string; text: string }
}

export namespace Timeline {
  export function constructMessageRows(
    userMessage: UserMessage,
    getMessageParts: (messageID: string) => Part[],
    assistantMessages: AssistantMessage[],
    index: number,
    showReasoning: boolean,
    status: SessionStatus["type"],
    isActive: boolean,
    collapseInProgress: boolean,
  ) {
    const rows: TimelineRow.TimelineRow[] = []

    const previousUserMessage = index > 0
    const userParts = getMessageParts(userMessage.id)
    const comments = userParts.flatMap((p) => MessageComment.fromPart(p) ?? [])
    const compaction = userParts.some((p) => p.type === "compaction")
    const interruptedMessageIndex = assistantMessages.findIndex((m) => m.error?.name === "MessageAbortedError")
    const interrupted = interruptedMessageIndex !== -1
    const error = assistantMessages.find((m) => m.error && m.error.name !== "MessageAbortedError")?.error

    const assistantPartRefs = assistantMessages.flatMap((message, messageIndex) =>
      getMessageParts(message.id)
        .filter((part) => renderable(part, showReasoning || collapseInProgress))
        .map((part) => ({ messageID: message.id, messageIndex, part })),
    )
    const partByID = new Map(assistantPartRefs.map((ref) => [ref.part.id, ref.part]))
    const assistantItems =
      interrupted && !compaction
        ? [
            ...groupParts(assistantPartRefs.filter((ref) => ref.messageIndex <= interruptedMessageIndex)).map(
              (group) => ({
                type: "part" as const,
                group,
              }),
            ),
            { type: "interrupted" as const },
            ...groupParts(assistantPartRefs.filter((ref) => ref.messageIndex > interruptedMessageIndex)).map(
              (group) => ({
                type: "part" as const,
                group,
              }),
            ),
          ]
        : groupParts(assistantPartRefs).map((group) => ({ type: "part" as const, group }))
    if (previousUserMessage) rows.push(new TimelineRow.TurnGap({ userMessageID: userMessage.id }))

    if (comments.length > 0)
      rows.push(
        new TimelineRow.CommentStrip({
          userMessageID: userMessage.id,
        }),
      )

    rows.push(
      new TimelineRow.UserMessage({
        userMessageID: userMessage.id,
        anchor: comments.length === 0,
      }),
    )

    if (compaction) {
      rows.push(
        new TimelineRow.TurnDivider({
          userMessageID: userMessage.id,
          label: "compaction",
        }),
      )
    }

    let assistantGroupIndex = 0
    let emittedInProgressGroup = false

    if (collapseInProgress) {
      const allPartItems = assistantItems.filter(
        (item): item is { type: "part"; group: PartGroup } => item.type === "part",
      )
      // Only the last assistant message can contribute the turn's final text, and only once
      // it actually finished with "stop" — a text part can appear mid-turn (e.g. narration
      // before more tool calls) and must stay inside the in-progress group until then.
      const lastAssistantMessage = assistantMessages.at(-1)
      const lastAssistantMessageID = lastAssistantMessage?.id
      const finalTextIndex =
        lastAssistantMessage?.finish === "stop" ? findFinalTextGroup(allPartItems, partByID, lastAssistantMessageID) : -1
      const hasFinal = finalTextIndex !== -1
      const finalItem = hasFinal ? allPartItems[finalTextIndex]! : undefined

      const inProgressItems = hasFinal ? allPartItems.slice(0, finalTextIndex) : allPartItems
      const inProgressIDs = new Set(inProgressItems.map((item) => item.group.key))

      let currentSegment: { type: "part"; group: PartGroup }[] = []
      for (const item of assistantItems) {
        if (item.type === "interrupted") {
          emitInProgressSegment(rows, currentSegment, userMessage.id, assistantGroupIndex, partByID, {
            isActive,
            status,
            error,
            hasFinalFollowing: false,
          })
          assistantGroupIndex += currentSegment.length
          if (currentSegment.length > 0) emittedInProgressGroup = true
          rows.push(new TimelineRow.TurnDivider({ userMessageID: userMessage.id, label: "interrupted" }))
          currentSegment = []
          continue
        }

        if (inProgressIDs.has(item.group.key)) {
          currentSegment.push(item)
        }
      }
      if (currentSegment.length > 0) {
        emitInProgressSegment(rows, currentSegment, userMessage.id, assistantGroupIndex, partByID, {
          isActive,
          status,
          error,
          hasFinalFollowing: hasFinal,
        })
        assistantGroupIndex += currentSegment.length
        emittedInProgressGroup = true
      }

      if (finalItem) {
        rows.push(
          new TimelineRow.AssistantPart({
            userMessageID: userMessage.id,
            group: finalItem.group,
            previousAssistantPart: assistantGroupIndex > 0,
            followsInProgress: emittedInProgressGroup,
          }),
        )
        assistantGroupIndex += 1
      }
    } else {
      for (const item of assistantItems) {
        if (item.type === "interrupted") {
          rows.push(new TimelineRow.TurnDivider({ userMessageID: userMessage.id, label: "interrupted" }))
          continue
        }

        rows.push(
          new TimelineRow.AssistantPart({
            userMessageID: userMessage.id,
            group: item.group,
            previousAssistantPart: assistantGroupIndex > 0,
            followsInProgress: false,
          }),
        )
        assistantGroupIndex += 1
      }
    }

    const showThinkingShimmer =
      isActive &&
      status === "busy" &&
      !error &&
      !(collapseInProgress && emittedInProgressGroup) &&
      (!showReasoning || assistantPartRefs.length === 0)

    if (showThinkingShimmer) {
      const reasoningTexts = assistantMessages
        .flatMap((message) => getMessageParts(message.id))
        .map((part) => (part.type === "reasoning" ? part.text ?? "" : ""))

      const heading = reasoningTexts.map(reasoningHeading).find((value): value is string => !!value)
      const reasoningTokens = Math.round(reasoningTexts.reduce((sum, text) => sum + text.length, 0) / 3)

      rows.push(
        new TimelineRow.Thinking({
          userMessageID: userMessage.id,
          reasoningHeading: heading,
          reasoningTokens,
        }),
      )
    }

    if (isActive && status === "retry") rows.push(new TimelineRow.Retry({ userMessageID: userMessage.id }))

    const diffs = (userMessage.summary?.diffs ?? [])
      .reduceRight<SummaryDiff[]>((result, diff) => {
        if (!isSummaryDiff(diff)) return result
        if (result.some((item) => item.file === diff.file)) return result
        result.push(diff)
        return result
      }, [])
      .reverse()
    if (diffs.length > 0 && (status === "idle" || !isActive)) {
      rows.push(
        new TimelineRow.DiffSummary({
          userMessageID: userMessage.id,
          diffs,
        }),
      )
    }

    if (error) {
      const data = error.data?.message
      rows.push(
        new TimelineRow.Error({
          userMessageID: userMessage.id,
          text: unwrapErrorMessage(
            typeof data === "string" ? data : data === undefined || data === null ? "" : String(data),
          ),
        }),
      )
    }

    return rows
  }

  function isSummaryDiff(value: SnapshotFileDiff): value is SummaryDiff {
    return typeof value.file === "string"
  }

  function findFinalTextGroup(
    items: { type: "part"; group: PartGroup }[],
    partByID: Map<string, Part>,
    lastAssistantMessageID: string | undefined,
  ): number {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]
      const group = item.group
      if (group.type !== "part") continue
      if (group.ref.messageID !== lastAssistantMessageID) continue
      const part = partByID.get(group.ref.partID)
      if (part?.type === "text" && part.text?.trim()) return i
    }
    return -1
  }

  function lastHeading(
    segment: { type: "part"; group: PartGroup }[],
    partByID: Map<string, Part>,
    partType: "reasoning" | "text",
    extract: (text: string) => string | undefined,
  ): string | undefined {
    for (let i = segment.length - 1; i >= 0; i--) {
      const group = segment[i]!.group
      if (group.type !== "part") continue
      const part = partByID.get(group.ref.partID)
      if (part?.type !== partType) continue
      const heading = extract(part.text ?? "")
      if (heading) return heading
    }
    return undefined
  }

  function emitInProgressSegment(
    rows: TimelineRow.TimelineRow[],
    segment: { type: "part"; group: PartGroup }[],
    userMessageID: string,
    assistantGroupIndex: number,
    partByID: Map<string, Part>,
    opts: {
      isActive: boolean
      status: SessionStatus["type"]
      error: { name: string; data?: { message?: unknown } } | undefined
      // A final answer following this segment makes a stale "last thought" redundant
      // with the real response, so the heading is suppressed in that case.
      hasFinalFollowing: boolean
    },
  ) {
    if (segment.length === 0) return
    rows.push(
      new TimelineRow.InProgressGroup({
        userMessageID,
        groups: segment,
        previousAssistantPart: assistantGroupIndex > 0,
        active: opts.isActive && opts.status === "busy" && !opts.error,
        lastThoughtHeading: opts.hasFinalFollowing ? undefined : lastHeading(segment, partByID, "reasoning", reasoningHeading),
        lastTextHeading: opts.hasFinalFollowing ? undefined : lastHeading(segment, partByID, "text", textHeading),
      }),
    )
  }

  function unwrapErrorMessage(message: string) {
    const text = message.replace(/^Error:\s*/, "").trim()

    const parse = (value: string) => {
      try {
        return JSON.parse(value) as unknown
      } catch {
        return undefined
      }
    }

    const read = (value: string) => {
      const first = parse(value)
      if (typeof first !== "string") return first
      return parse(first.trim())
    }

    let json = read(text)

    if (json === undefined) {
      const start = text.indexOf("{")
      const end = text.lastIndexOf("}")
      if (start !== -1 && end > start) json = read(text.slice(start, end + 1))
    }

    if (!record(json)) return message

    const err = record(json.error) ? json.error : undefined
    if (err) {
      const type = typeof err.type === "string" ? err.type : undefined
      const msg = typeof err.message === "string" ? err.message : undefined
      if (type && msg) return `${type}: ${msg}`
      if (msg) return msg
      if (type) return type
      const code = typeof err.code === "string" ? err.code : undefined
      if (code) return code
    }

    const msg = typeof json.message === "string" ? json.message : undefined
    if (msg) return msg

    const reason = typeof json.error === "string" ? json.error : undefined
    if (reason) return reason

    return message
  }

  function record(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
  }
}

export namespace MessageComment {
  export type MessageComment = {
    path: string
    comment: string
    selection?: {
      startLine: number
      endLine: number
    }
  }

  export const fromPart = (part: Part): MessageComment | undefined => {
    if (part.type !== "text" || !part.synthetic) return
    const next = readCommentMetadata(part.metadata) ?? parseCommentNote(part.text)
    if (!next) return
    return {
      path: next.path,
      comment: next.comment,
      selection: next.selection
        ? {
            startLine: next.selection.startLine,
            endLine: next.selection.endLine,
          }
        : undefined,
    }
  }
}

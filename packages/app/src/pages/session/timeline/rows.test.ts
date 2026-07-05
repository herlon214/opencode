import { describe, expect, mock, test } from "bun:test"
import type { AssistantMessage, Part, UserMessage } from "@opencode-ai/sdk/v2"
import { reuseTimelineRows } from "./row-reconciliation"
import { TimelineRow } from "./timeline-row"

// rows.ts transitively imports session-ui's markdown worker, whose vite
// `?worker&url` import has no default export under bun's resolver.
mock.module("../../../../../session-ui/src/components/markdown-shiki.worker.ts?worker&url", () => ({ default: "" }))

// Kobalte builds DOM templates at import time; bun resolves solid-js/web to
// the server build where those APIs throw. Nothing renders in this test.
const solidWeb = await import("solid-js/web")
mock.module("solid-js/web", () => ({
  ...solidWeb,
  template: () => () => document.createElement("div"),
  delegateEvents: () => {},
}))

const { Timeline } = await import("./rows")

const userMessage = { id: "user-1", role: "user", sessionID: "session-1", time: { created: 1 } } as UserMessage

const assistantMessage = {
  id: "assistant-1",
  role: "assistant",
  parentID: "user-1",
  sessionID: "session-1",
  time: { created: 2 },
} as AssistantMessage

const reasoningPart = (text: string) =>
  ({
    id: "part-1",
    messageID: "assistant-1",
    sessionID: "session-1",
    type: "reasoning",
    text,
    time: { start: 1 },
  }) as Part

const thinkingRows = (reasoningText: string) =>
  Timeline.constructMessageRows(
    userMessage,
    (messageID) => (messageID === assistantMessage.id ? [reasoningPart(reasoningText)] : []),
    [assistantMessage],
    0,
    false,
    "busy",
    true,
    false,
  )

const thinking = (rows: TimelineRow.TimelineRow[]) => {
  const row = rows.find((row): row is TimelineRow.Thinking => row._tag === "Thinking")
  expect(row).toBeDefined()
  return row!
}

describe("Thinking row identity during reasoning streaming", () => {
  test("stays structurally equal across reasoning deltas", () => {
    // The live token count lives in the thinking component, not the row, so
    // growing reasoning text must never produce a structurally different row.
    const previous = thinkingRows("x".repeat(100))
    const next = thinkingRows("x".repeat(5000))

    expect(TimelineRow.equals(thinking(previous), thinking(next))).toBe(true)
    expect(reuseTimelineRows(previous, next)).toBe(previous)
  })

  test("still surfaces the first reasoning heading", () => {
    const rows = thinkingRows(`# Exploring the codebase\n\n${"x".repeat(200)}`)
    expect(thinking(rows).reasoningHeading).toBe("Exploring the codebase")
  })
})

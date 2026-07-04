import { describe, expect, test } from "bun:test"
import { streamingDuration } from "./message-part-reasoning"

describe("streamingDuration", () => {
  test("returns 0 for an empty part list", () => {
    expect(streamingDuration([])).toBe(0)
  })

  test("ignores non-text, non-reasoning parts even when they carry time", () => {
    expect(
      streamingDuration([
        { type: "tool", time: { start: 1_000, end: 2_000 } },
        { type: "step-start", time: { start: 1_000, end: 2_000 } },
      ]),
    ).toBe(0)
  })

  test("ignores text/reasoning parts with missing end", () => {
    expect(
      streamingDuration([
        { type: "text", time: { start: 1_000 } },
        { type: "reasoning", time: { start: 2_000 } },
      ]),
    ).toBe(0)
  })

  test("ignores parts with no time field at all", () => {
    expect(streamingDuration([{ type: "text" }])).toBe(0)
  })

  test("sums completed text and reasoning intervals", () => {
    expect(
      streamingDuration([
        { type: "text", time: { start: 1_000, end: 3_000 } },
        { type: "reasoning", time: { start: 4_000, end: 5_500 } },
      ]),
    ).toBe(3_500)
  })

  test("skips non-positive deltas (end <= start)", () => {
    expect(
      streamingDuration([
        { type: "text", time: { start: 1_000, end: 1_000 } },
        { type: "reasoning", time: { start: 2_000, end: 1_000 } },
        { type: "text", time: { start: 3_000, end: 4_000 } },
      ]),
    ).toBe(1_000)
  })

  test("excludes idle gaps between parts from the total", () => {
    expect(
      streamingDuration([
        { type: "text", time: { start: 1_000, end: 2_000 } },
        { type: "reasoning", time: { start: 10_000, end: 11_000 } },
      ]),
    ).toBe(2_000)
  })

  test("tolerates foreign time shapes (e.g. { created }) without crashing", () => {
    expect(
      streamingDuration([
        { type: "retry", time: { created: 1_000 } },
        { type: "text", time: { start: 1_000, end: 4_000 } },
      ]),
    ).toBe(3_000)
  })

  test("regression: full turn wall-clock wait is NOT counted as streaming", () => {
    // Simulates a turn that waited 8s for the server, then streamed 2s of text.
    // The pre-stream wait must not contribute to the streaming duration.
    const parts = [{ type: "text", time: { start: 8_000, end: 10_000 } }]
    expect(streamingDuration(parts)).toBe(2_000)
  })
})

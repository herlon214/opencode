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

  test("uses earliest start to latest end across text and reasoning parts", () => {
    expect(
      streamingDuration([
        { type: "text", time: { start: 1_000, end: 3_000 } },
        { type: "reasoning", time: { start: 4_000, end: 5_500 } },
      ]),
    ).toBe(4_500)
  })

  test("skips non-positive deltas (end <= start) when finding bounds", () => {
    expect(
      streamingDuration([
        { type: "text", time: { start: 1_000, end: 1_000 } },
        { type: "reasoning", time: { start: 2_000, end: 1_000 } },
        { type: "text", time: { start: 3_000, end: 4_000 } },
      ]),
    ).toBe(1_000)
  })

  test("includes idle gaps between parts in the contiguous window", () => {
    expect(
      streamingDuration([
        { type: "text", time: { start: 1_000, end: 2_000 } },
        { type: "reasoning", time: { start: 10_000, end: 11_000 } },
      ]),
    ).toBe(10_000)
  })

  test("tolerates foreign time shapes (e.g. { created }) without crashing", () => {
    expect(
      streamingDuration([
        { type: "retry", time: { created: 1_000 } },
        { type: "text", time: { start: 1_000, end: 4_000 } },
      ]),
    ).toBe(3_000)
  })

  test("regression: pre-stream wait is NOT counted, only first-token to last-token", () => {
    // A turn that waited 8s for the server, then streamed 2s of text.
    // The window starts at the first token (8s), not at request dispatch (0s).
    const parts = [{ type: "text", time: { start: 8_000, end: 10_000 } }]
    expect(streamingDuration(parts)).toBe(2_000)
  })
})
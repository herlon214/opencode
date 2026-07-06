import { describe, expect, test } from "bun:test"
import { experimentalWebSocketsEnabled } from "../../src/plugin"

describe("plugin.openai.websocket rollout", () => {
  test("enables websockets whenever the flag is enabled", () => {
    expect(experimentalWebSocketsEnabled({ enabled: true, channel: "local" })).toBe(true)
    expect(experimentalWebSocketsEnabled({ enabled: true, channel: "dev" })).toBe(true)
    expect(experimentalWebSocketsEnabled({ enabled: true, channel: "beta" })).toBe(true)
    expect(experimentalWebSocketsEnabled({ enabled: true, channel: "latest" })).toBe(true)
    expect(experimentalWebSocketsEnabled({ enabled: true, channel: "prod" })).toBe(true)
  })

  test("respects the runtime flag opt-out regardless of channel", () => {
    expect(experimentalWebSocketsEnabled({ enabled: false, channel: "local" })).toBe(false)
    expect(experimentalWebSocketsEnabled({ enabled: false, channel: "latest" })).toBe(false)
  })
})

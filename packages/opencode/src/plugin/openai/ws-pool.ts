import WebSocket from "ws"
import { ProviderError } from "@/provider/error"
import { isRecord } from "@/util/record"
import { OpenAIWebSocket } from "./ws"

export const TITLE_HEADER = "x-opencode-title"

export interface CreateWebSocketFetchOptions {
  httpFetch?: typeof globalThis.fetch
  url?: string
  connectTimeout?: number
  idleTimeout?: number
  maxConnectionAge?: number
  maxConnectionsPerSession?: number
  streamRetries?: number
}

interface PoolLane {
  socket?: WebSocket
  connectedAt?: number
  lastUsedAt: number
  busy: boolean
}

interface PoolEntry {
  lanes: PoolLane[]
  fallback: boolean
  streamFailures: number
  lastRequest?: Record<string, unknown>
  lastResponse?: LastResponse
}

interface LastResponse {
  id: string
  output: unknown[]
}

const DEFAULT_CONNECT_TIMEOUT = 15_000
const DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000
const DEFAULT_MAX_CONNECTION_AGE = 55 * 60 * 1000
const DEFAULT_MAX_CONNECTIONS_PER_SESSION = 4
const CONNECTION_LIMIT_REACHED_CODE = "websocket_connection_limit_reached"

export function createWebSocketFetch(options?: CreateWebSocketFetchOptions) {
  const httpFetch = options?.httpFetch ?? globalThis.fetch
  const pool = new Map<string, PoolEntry>()
  const connectTimeout = options?.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT
  const idleTimeout = options?.idleTimeout ?? DEFAULT_IDLE_TIMEOUT
  const maxConnectionAge = options?.maxConnectionAge ?? DEFAULT_MAX_CONNECTION_AGE
  const maxConnectionsPerSession = Math.max(1, options?.maxConnectionsPerSession ?? DEFAULT_MAX_CONNECTIONS_PER_SESSION)
  const streamRetries = options?.streamRetries ?? 5
  const pruneTimer = setInterval(() => prune(), Math.min(idleTimeout, 60_000))
  if (typeof pruneTimer === "object" && "unref" in pruneTimer && typeof pruneTimer.unref === "function") {
    pruneTimer.unref()
  }

  async function websocketFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = input instanceof URL ? input.toString() : typeof input === "string" ? input : input.url
    const internalHeaders = OpenAIWebSocket.normalizeHeaders(init?.headers)
    const httpInit = withoutInternalHeaders(init)

    if (init?.method !== "POST" || !new URL(url).pathname.endsWith("/responses")) {
      return httpFetch(input, httpInit)
    }

    const body = (() => {
      try {
        if (typeof init?.body !== "string") return undefined
        const parsed = JSON.parse(init.body)
        return typeof parsed === "object" && parsed !== null ? parsed : undefined
      } catch {
        return undefined
      }
    })()
    if (!body?.stream) return httpFetch(input, httpInit)
    if (internalHeaders[TITLE_HEADER] === "true") {
      return httpFetch(input, httpInit)
    }

    const sessionID = internalHeaders["x-session-affinity"] ?? internalHeaders["session-id"]
    if (!sessionID) {
      return httpFetch(input, httpInit)
    }
    const key = `${sessionID}:conversation`

    const entry = pool.get(key) ?? { lanes: [], fallback: false, streamFailures: 0 }
    pool.set(key, entry)

    if (entry.fallback) {
      return httpFetch(input, httpInit)
    }
    const lane = laneFor(entry, maxConnectionsPerSession)
    if (!lane) {
      return httpFetch(input, httpInit)
    }

    lane.busy = true
    lane.lastUsedAt = Date.now()
    try {
      lane.socket = await socket(
        lane,
        options?.url ?? url,
        OpenAIWebSocket.normalizeHeaders(httpInit?.headers),
        connectTimeout,
        maxConnectionAge,
        init?.signal,
      )
      let resolveFirstEvent: (event: boolean | OpenAIWebSocket.WrappedError) => void = () => {}
      let rejectFirstEvent: (error: Error) => void = () => {}
      const firstEvent = new Promise<boolean | OpenAIWebSocket.WrappedError>((resolve, reject) => {
        resolveFirstEvent = resolve
        rejectFirstEvent = reject
      })
      const response = OpenAIWebSocket.streamResponsesWebSocket({
        socket: lane.socket,
        body: bodyForWebSocket(entry, body),
        idleTimeout,
        signal: init?.signal ?? undefined,
        onFirstEvent: (error) => resolveFirstEvent(error ?? true),
        onComplete: (event) => recordCompletion(entry, body, event),
        onTerminal: (event) => {
          lane.busy = false
          lane.lastUsedAt = Date.now()
          entry.streamFailures = 0
          if (event.type !== "response.completed" && event.type !== "response.done") {
            invalidate(lane)
          }
        },
        onConnectionInvalid: (error) => {
          lane.busy = false
          lane.lastUsedAt = Date.now()
          if (!entry.fallback) recordStreamFailure(entry)
          invalidate(lane)
          resolveFirstEvent(false)
        },
        onAbort: (error) => {
          lane.busy = false
          lane.lastUsedAt = Date.now()
          entry.streamFailures = 0
          invalidate(lane)
          rejectFirstEvent(error)
        },
        onRetryableTerminal: async (event) => {
          const error = connectionLimitError(event)
          if (!error) return undefined
          throw error
        },
      })
      const first = await firstEvent
      if (first !== false) {
        if (first === true || first.status < 200 || first.status > 599) return response
        return new Response(first.body, {
          status: first.status,
          headers: { "content-type": "application/json", ...first.headers },
        })
      }
      if (!entry.fallback) return response
      return httpFetch(input, httpInit)
    } catch (error) {
      lane.busy = false
      lane.lastUsedAt = Date.now()
      if (OpenAIWebSocket.isAbortError(error)) {
        entry.streamFailures = 0
        invalidate(lane)
        throw error
      }

      recordStreamFailure(entry)
      invalidate(lane)
      if (entry.fallback) return httpFetch(input, httpInit)
      return failedResponse(
        new ProviderError.ResponseStreamError(error instanceof Error ? error.message : String(error), {
          cause: error,
        }),
      )
    }
  }

  function recordStreamFailure(entry: PoolEntry) {
    entry.streamFailures++
    // Codex counts retries after the initial failed WebSocket attempt.
    if (entry.streamFailures > streamRetries) entry.fallback = true
  }

  function prune() {
    const now = Date.now()
    for (const [key, entry] of pool) {
      if (entry.fallback) continue
      entry.lanes = entry.lanes.filter((lane) => {
        if (lane.busy) return true
        if (now - lane.lastUsedAt < idleTimeout) return true
        invalidate(lane)
        return false
      })
      if (entry.lanes.length === 0) pool.delete(key)
    }
  }

  function close() {
    clearInterval(pruneTimer)
    for (const entry of pool.values()) {
      for (const lane of entry.lanes) invalidate(lane)
    }
    pool.clear()
  }

  function remove(sessionID: string) {
    const key = `${sessionID}:conversation`
    const entry = pool.get(key)
    if (!entry) return
    for (const lane of entry.lanes) invalidate(lane)
    pool.delete(key)
  }

  return Object.assign(websocketFetch, { close, remove })
}

function laneFor(entry: PoolEntry, maxConnectionsPerSession: number) {
  const idle = entry.lanes.find((lane) => !lane.busy)
  if (idle) return idle
  if (entry.lanes.length >= maxConnectionsPerSession) return undefined
  const lane: PoolLane = { lastUsedAt: Date.now(), busy: false }
  entry.lanes.push(lane)
  return lane
}

function bodyForWebSocket(entry: PoolEntry, body: Record<string, unknown>) {
  const incremental = incrementalInput(entry, body)
  if (!incremental || !entry.lastResponse) return body
  return {
    ...body,
    previous_response_id: entry.lastResponse.id,
    input: incremental,
  }
}

function incrementalInput(entry: PoolEntry, body: Record<string, unknown>) {
  if (!entry.lastRequest || !entry.lastResponse) return undefined
  if (typeof body.previous_response_id === "string") return undefined
  if (!requestPropertiesMatch(entry.lastRequest, body)) return undefined
  if (!Array.isArray(entry.lastRequest.input) || !Array.isArray(body.input)) return undefined

  const prefix = [...entry.lastRequest.input, ...entry.lastResponse.output]
  if (body.input.length < prefix.length) return undefined
  if (!jsonEqual(body.input.slice(0, prefix.length), prefix)) return undefined
  return body.input.slice(prefix.length)
}

function requestPropertiesMatch(previous: Record<string, unknown>, current: Record<string, unknown>) {
  return jsonEqual(requestProperties(previous), requestProperties(current))
}

function requestProperties(body: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(body).filter(
      ([key]) => !["background", "client_metadata", "input", "previous_response_id", "stream"].includes(key),
    ),
  )
}

function recordCompletion(entry: PoolEntry, request: Record<string, unknown>, event: Record<string, unknown>) {
  const response = isRecord(event.response) ? event.response : undefined
  if (typeof response?.id !== "string") return
  if (!Array.isArray(response.output)) return
  entry.lastRequest = request
  entry.lastResponse = { id: response.id, output: response.output }
}

function jsonEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function connectionLimitError(event: Record<string, unknown>) {
  if (event.type !== "error" || !isRecord(event.error) || event.error.code !== CONNECTION_LIMIT_REACHED_CODE) return
  return new Error(typeof event.error.message === "string" ? event.error.message : CONNECTION_LIMIT_REACHED_CODE)
}

function failedResponse(error: ProviderError.ResponseStreamError) {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.error(error)
      },
    }),
    {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    },
  )
}

async function socket(
  lane: PoolLane,
  url: string,
  headers: Record<string, string>,
  connectTimeout: number,
  maxConnectionAge: number,
  signal?: AbortSignal | null,
) {
  if (
    lane.socket?.readyState === WebSocket.OPEN &&
    lane.connectedAt &&
    Date.now() - lane.connectedAt < maxConnectionAge
  ) {
    return lane.socket
  }

  invalidate(lane)
  const next = await OpenAIWebSocket.connectResponsesWebSocket({
    url: OpenAIWebSocket.toWebSocketUrl(url),
    headers,
    timeout: connectTimeout,
    signal: signal ?? undefined,
  })
  lane.connectedAt = Date.now()
  return next
}

function invalidate(lane: PoolLane) {
  if (lane.socket) {
    lane.socket.on("error", () => {})
    lane.socket.terminate()
    lane.socket = undefined
  }
  lane.connectedAt = undefined
}

export function withoutInternalHeaders<T extends { headers?: HeadersInit }>(init: T | undefined): T | undefined {
  if (!init?.headers) return init
  if (init.headers instanceof Headers) {
    const headers = new Headers(init.headers)
    headers.delete(TITLE_HEADER)
    return { ...init, headers }
  }

  if (Array.isArray(init.headers)) {
    return { ...init, headers: init.headers.filter((item) => item[0].toLowerCase() !== TITLE_HEADER) }
  }

  return {
    ...init,
    headers: Object.fromEntries(Object.entries(init.headers).filter(([key]) => key.toLowerCase() !== TITLE_HEADER)),
  }
}

export * as OpenAIWebSocketPool from "./ws-pool"

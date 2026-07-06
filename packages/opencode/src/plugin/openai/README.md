# OpenAI Responses WebSocket

Enabled by default. Set `OPENCODE_DISABLE_WEBSOCKETS=true` to opt out.

## Flow

1. A streamed `POST /responses` request arrives.
2. If it has no `session-id` or `x-session-affinity` header, use HTTP.
3. Title requests use HTTP.
4. If that session is already in fallback mode, use HTTP.
5. Otherwise, reuse an idle socket or open another lane up to the per-session limit.
6. Send `response.create` and return WebSocket events as SSE.
7. After a completed response, compatible follow-up requests use `previous_response_id` and send only the incremental input items.

## Lifetime

- Connect timeout: 15 seconds.
- Idle timeout: 5 minutes.
- After a completed response, keep the socket for reuse.
- Reuse a socket for up to 55 minutes, then replace it on the next request.
- Up to 4 concurrent WebSocket lanes are opened per session; additional concurrent requests use HTTP.

## Retries

- Retry WebSocket stream/setup failures up to 5 times, then use HTTP for that session until the pool entry is idle-pruned.
- `websocket_connection_limit_reached` consumes the same retry budget and HTTP fallback.
- If a WebSocket fails after its first event, fail it as retryable rather than replaying partial output in transport.
- Abort or cancel closes the socket.

export function reasoningHeading(text: string): string | undefined {
  const markdown = text.replace(/\r\n?/g, "\n")

  const html = markdown.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)
  if (html?.[1]) {
    const value = cleanHeading(html[1].replace(/<[^>]+>/g, " "))
    if (value) return value
  }

  return (
    matchHeading(markdown, /^\s{0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/m) ??
    matchHeading(markdown, /^([^\n]+)\n(?:=+|-+)\s*$/m) ??
    matchHeading(markdown, /^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*$/m)
  )
}

export function textHeading(text: string): string | undefined {
  const firstLine = text.replace(/\r\n?/g, "\n").split("\n").find((line) => line.trim())
  if (!firstLine) return undefined
  return cleanHeading(firstLine)
}

function matchHeading(markdown: string, pattern: RegExp): string | undefined {
  const match = markdown.match(pattern)
  if (!match?.[1]) return
  const value = cleanHeading(match[1])
  return value || undefined
}

function cleanHeading(value: string) {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~]+/g, "")
    .trim()
}

export function formatDuration(input: number): string {
  if (input < 1000) return `${input}ms`
  if (input < 60000) return `${Math.round(input / 1000)}s`
  if (input < 3600000) {
    const minutes = Math.floor(input / 60000)
    const seconds = Math.floor((input % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }
  if (input < 86400000) {
    const hours = Math.floor(input / 3600000)
    const minutes = Math.floor((input % 3600000) / 60000)
    return `${hours}h ${minutes}m`
  }
  const days = Math.floor(input / 86400000)
  const hours = Math.floor((input % 86400000) / 3600000)
  return `${days}d ${hours}h`
}

export function reasoningDuration(part: { time: { start: number; end?: number } }): number | undefined {
  const end = part.time.end
  if (end === undefined) return undefined
  return Math.max(0, end - part.time.start)
}

// Contiguous streaming window across text and reasoning parts: from the
// earliest part start to the latest part end. This mirrors the standard
// TPS methodology (total_duration - time_to_first_token), isolating
// generation from pre-stream wait while including inter-part gaps.
export function streamingDuration(
  parts: ReadonlyArray<{ type: string; time?: { start?: number; end?: number } | Record<string, unknown> }>,
): number {
  let firstStart: number | undefined
  let lastEnd: number | undefined
  for (const part of parts) {
    if (part.type !== "text" && part.type !== "reasoning") continue
    const time = part.time
    if (!time) continue
    if (typeof time.start !== "number" || typeof time.end !== "number") continue
    if (time.end <= time.start) continue
    if (firstStart === undefined || time.start < firstStart) firstStart = time.start
    if (lastEnd === undefined || time.end > lastEnd) lastEnd = time.end
  }
  if (firstStart === undefined || lastEnd === undefined) return 0
  return Math.max(0, lastEnd - firstStart)
}
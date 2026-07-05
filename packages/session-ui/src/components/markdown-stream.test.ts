import { describe, expect, test } from "bun:test"
import { canReusePendingBlock, project, stream, type Projection } from "./markdown-stream"

describe("markdown stream", () => {
  test("heals incomplete emphasis while streaming", () => {
    expect(stream("hello **world", true)).toEqual([{ raw: "hello **world", src: "hello **world**", mode: "live" }])
    expect(stream("say `code", true)).toEqual([{ raw: "say `code", src: "say `code`", mode: "live" }])
  })

  test("keeps incomplete links non-clickable until they finish", () => {
    expect(stream("see [docs](https://example.com/gu", true)).toEqual([
      { raw: "see [docs](https://example.com/gu", src: "see docs", mode: "live" },
    ])
  })

  test("splits an unfinished trailing code fence from stable content", () => {
    expect(stream("before\n\n```ts\nconst x = 1", true)).toEqual([
      { raw: "before\n\n", src: "before\n\n", mode: "full" },
      { raw: "```ts\nconst x = 1", src: "const x = 1", mode: "code", language: "ts" },
    ])
  })

  test("fully parses a code fence once it closes", () => {
    const text = "before\n\n```ts\nconst x = 1\n```"
    expect(stream(text, true)).toEqual([
      { raw: "before\n\n", src: "before\n\n", mode: "full" },
      { raw: "```ts\nconst x = 1\n```", src: "const x = 1", mode: "code", language: "ts", complete: true },
    ])
  })

  test("keeps a completed code fence in worker-rendered code mode when prose follows", () => {
    expect(stream("```ts\nconst x = 1\n```\n\nafter", true)).toEqual([
      { raw: "```ts\nconst x = 1\n```\n\n", src: "const x = 1", mode: "code", language: "ts", complete: true },
      { raw: "after", src: "after", mode: "live" },
    ])
  })

  test("freezes completed top-level blocks and only keeps the tail live", () => {
    expect(stream("# Plan\n\nFinished paragraph.\n\n- live item", true)).toEqual([
      { raw: "# Plan\n\n", src: "# Plan\n\n", mode: "full" },
      { raw: "Finished paragraph.\n\n", src: "Finished paragraph.\n\n", mode: "full" },
      { raw: "- live item", src: "- live item", mode: "live" },
    ])
  })

  test("keeps a trailing list live while appended text could still join it", () => {
    // "1. a\n\n2" lexes as list + paragraph, but appending "." merges both
    // into a single list token, so the list must not freeze yet.
    expect(stream("1. a\n\n2", true)).toEqual([{ raw: "1. a\n\n2", src: "1. a\n\n2", mode: "live" }])
  })

  test("freezes a list once a non-list block separates it from the tail", () => {
    expect(stream("1. a\n\n2. b\n\nMiddle prose.\n\nTail", true)).toEqual([
      { raw: "1. a\n\n2. b\n\n", src: "1. a\n\n2. b\n\n", mode: "full" },
      { raw: "Middle prose.\n\n", src: "Middle prose.\n\n", mode: "full" },
      { raw: "Tail", src: "Tail", mode: "live" },
    ])
  })

  test("keeps a growing table together until a later block freezes it", () => {
    expect(stream("| a | b |\n|---|---|\n| 1 | 2 |", true)).toEqual([
      { raw: "| a | b |\n|---|---|\n| 1 | 2 |", src: "| a | b |\n|---|---|\n| 1 | 2 |", mode: "live" },
    ])
  })

  test("reprojects non-prefix replacements from current content", () => {
    expect(stream("# Replacement\n\nNew body", true)).toEqual([
      { raw: "# Replacement\n\n", src: "# Replacement\n\n", mode: "full" },
      { raw: "New body", src: "New body", mode: "live" },
    ])
  })

  test("reprojects truncation without retaining removed blocks", () => {
    expect(stream("Only the restored prefix", true)).toEqual([
      { raw: "Only the restored prefix", src: "Only the restored prefix", mode: "live" },
    ])
  })

  test("shifts later blocks when an earlier block is inserted", () => {
    expect(stream("# Inserted\n\nFirst body\n\nSecond body", true)).toEqual([
      { raw: "# Inserted\n\n", src: "# Inserted\n\n", mode: "full" },
      { raw: "First body\n\n", src: "First body\n\n", mode: "full" },
      { raw: "Second body", src: "Second body", mode: "live" },
    ])
  })

  test("keeps reference-style markdown as one block", () => {
    expect(stream("[docs][1]\n\n[1]: https://example.com", true)).toEqual([
      {
        raw: "[docs][1]\n\n[1]: https://example.com",
        src: "[docs][1]\n\n[1]: https://example.com",
        mode: "live",
      },
    ])
  })

  test("keeps compact and indented reference definitions with their uses", () => {
    expect(stream("[docs]\n\n   [docs]:/guide", true)).toEqual([
      {
        raw: "[docs]\n\n   [docs]:/guide",
        src: "[docs]\n\n   [docs]:/guide",
        mode: "live",
      },
    ])
  })

  test("keeps multiline reference definitions with their uses", () => {
    expect(stream("[docs][id]\n\n[id]:\n  /guide", true)).toEqual([
      {
        raw: "[docs][id]\n\n[id]:\n  /guide",
        src: "[docs][id]\n\n[id]:\n  /guide",
        mode: "live",
      },
    ])
  })

  test("uses only the language portion of fence metadata", () => {
    expect(stream("```ts title=example\nconst x = 1", true)).toEqual([
      {
        raw: "```ts title=example\nconst x = 1",
        src: "const x = 1",
        mode: "code",
        language: "ts",
      },
    ])
  })

  test("preserves trailing newlines in open code fences", () => {
    expect(stream("```ts\nconst x = 1\n", true)).toEqual([
      {
        raw: "```ts\nconst x = 1\n",
        src: "const x = 1\n",
        mode: "code",
        language: "ts",
      },
    ])
  })

  test("only reuses pending blocks with compatible identity and content", () => {
    expect(
      canReusePendingBlock({ mode: "full", raw: "First\n\n" }, { mode: "full", raw: "# Inserted\n\n", src: "" }),
    ).toBe(false)
    expect(
      canReusePendingBlock({ mode: "code", raw: "```ts\none" }, { mode: "code", raw: "```ts\none two", src: "" }),
    ).toBe(true)
    expect(canReusePendingBlock({ mode: "code", raw: "```ts\none" }, { mode: "live", raw: "one", src: "" })).toBe(false)
  })

  test("appends plain code deltas without reprojecting frozen blocks", () => {
    const previous = project(undefined, "# Plan\n\n```ts\nconst one = 1\n", true)
    const next = project(previous, `${previous.text}const two = 2\n`, true)

    expect(next.blocks[0]).toBe(previous.blocks[0])
    expect(next.blocks.at(-1)).toEqual({
      raw: "```ts\nconst one = 1\nconst two = 2\n",
      src: "const one = 1\nconst two = 2\n",
      mode: "code",
      language: "ts",
    })
  })

  test("does not add a blank line before the first streamed code", () => {
    const previous = project(undefined, "```ts\n", true)
    const next = project(previous, `${previous.text}const x = 1`, true)

    expect(next.blocks.at(-1)).toEqual({
      raw: "```ts\nconst x = 1",
      src: "const x = 1",
      mode: "code",
      language: "ts",
    })
  })

  test("closes code fences split across provider deltas", () => {
    const open = project(undefined, "```ts\nconst x = 1\n", true)
    const one = project(open, `${open.text}\``, true)
    const two = project(one, `${one.text}\``, true)
    const closed = project(two, `${two.text}\``, true)
    const prose = project(closed, `${closed.text}\nafter`, true)

    expect(closed.blocks.at(-1)).toEqual({
      raw: "```ts\nconst x = 1\n```",
      src: "const x = 1",
      mode: "code",
      language: "ts",
      complete: true,
    })
    expect(prose.blocks).toEqual([
      { raw: "```ts\nconst x = 1\n```\n", src: "const x = 1", mode: "code", language: "ts", complete: true },
      { raw: "after", src: "after", mode: "live" },
    ])
  })

  describe("incremental projection parity", () => {
    // Streams `text` chunk by chunk through project() and asserts that every
    // intermediate projection is byte-identical to a from-scratch stream() of
    // the same prefix.
    const simulate = (text: string, sizes: number[]) => {
      let projection: Projection | undefined
      let cursor = 0
      let step = 0
      while (cursor < text.length) {
        cursor = Math.min(text.length, cursor + sizes[step % sizes.length]!)
        const prefix = text.slice(0, cursor)
        projection = project(projection, prefix, true)
        expect(projection.blocks).toEqual(stream(prefix, true))
        step++
      }
      return projection!
    }

    const corpus = {
      "paragraph continuation": "Hello world, this paragraph keeps growing with more and more words as it streams in.",
      "new block after blank line": "First paragraph.\n\nSecond paragraph here.\n\nThird one closes it out.",
      "list items added": "Intro line.\n\n- one\n- two\n- three\n\nAfter the list.",
      "loose ordered list": "1. first item\n\n2. second item\n\n3. third item\n\nAfter the list.",
      "loose unordered list": "- alpha\n\n- beta\n\nAfter the list.",
      "ordered list interrupted then resumed": "1. a\n\n2. b\n\nmore prose\n\n3. not an item",
      "setext heading formed late": "Title line\n===\n\nBody text after the late heading.",
      "table rows appended": "| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n\nDone with the table.",
      "fence opened and closed": "Before the code.\n\n```ts\nconst x = 1\nconst y = 2\n```\n\nAfter prose resumes.",
      "headings and prose": "# Plan\n\nFirst step of the plan.\n\n## Next\n\nMore detail follows here.",
      "blockquote lazy continuation": "> quoted text\nthat continues lazily\n\nAfter the quote.",
      "leading blank lines": "\n\nLeading blanks then text.\n\nMore text after.",
      "reference definition mid-stream": "See [docs][1] for info.\n\nMore prose here.\n\n[1]: https://example.com",
    }

    for (const [name, text] of Object.entries(corpus)) {
      test(name, () => {
        for (const sizes of [[1], [3], [7], [5, 1, 11]]) {
          expect(simulate(text, sizes).blocks).toEqual(stream(text, true))
        }
      })
    }

    test("reuses frozen block references instead of re-lexing them", () => {
      const previous = project(undefined, "# Done\n\nFinished paragraph.\n\nGrowing tail", true)
      const next = project(previous, `${previous.text} keeps growing`, true)

      expect(previous.blocks.length).toBe(3)
      expect(next.blocks[0]).toBe(previous.blocks[0]!)
      expect(next.blocks[1]).toBe(previous.blocks[1]!)
      expect(next.blocks).toEqual(stream(next.text, true))
    })

    test("returns the previous blocks unchanged when no text was appended", () => {
      const previous = project(undefined, "Some prose.", true)
      expect(project(previous, previous.text, true).blocks).toBe(previous.blocks)
    })
  })

  test("closes tilde fences split across provider deltas", () => {
    const open = project(undefined, "~~~ts\nconst x = 1\n", true)
    const one = project(open, `${open.text}~`, true)
    const two = project(one, `${one.text}~`, true)
    const closed = project(two, `${two.text}~`, true)

    expect(closed.blocks.at(-1)).toEqual({
      raw: "~~~ts\nconst x = 1\n~~~",
      src: "const x = 1",
      mode: "code",
      language: "ts",
      complete: true,
    })
  })
})

import type { Prompt, QuoteReplyPart } from "@/context/prompt"

export function formatQuoteReplyPart(part: QuoteReplyPart) {
  return `${quote(part.quote)}\n\n${part.reply}`
}

export function promptText(prompt: Prompt) {
  return prompt.reduce((text, part) => {
    if (part.type === "quote-reply") {
      if (!text.trim()) return formatQuoteReplyPart(part)
      return `${text.trimEnd()}\n\n${formatQuoteReplyPart(part)}`
    }
    if ("content" in part) return text + part.content
    return text
  }, "")
}

function quote(text: string) {
  return text.split("\n").map((line) => `> ${line}`).join("\n")
}

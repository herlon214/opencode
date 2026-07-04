import { expect, test } from "@playwright/test"
import { assistantMessage, partDelta, setupTimeline, textPart, userMessage } from "../performance/timeline-stability/fixture"

test("keeps the composer caret stable while an assistant response streams", async ({ page }) => {
  const timeline = await setupTimeline(page, {
    settings: { newLayoutDesigns: true },
    messages: [userMessage(), assistantMessage([textPart("prt_streaming_text", "Working")], { completed: false })],
  })
  const input = page.locator('[data-component="session-composer"] [data-component="prompt-input"]')

  await expect(input).toBeVisible()
  await input.focus()
  await page.keyboard.type("abc")
  await expect(input).toHaveText("abc")

  await timeline.send(partDelta("prt_streaming_text", "..."))
  await input.evaluate((element) => {
    const range = document.createRange()
    range.setStart(element.firstChild ?? element, 0)
    range.collapse(true)

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    element.dispatchEvent(new FocusEvent("blur", { relatedTarget: null }))
    element.dispatchEvent(new FocusEvent("focus"))
  })
  await timeline.settle()

  await page.keyboard.type("d")
  await expect(input).toHaveText("abcd")
})

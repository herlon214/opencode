import { expect, test } from "@playwright/test"
import { setupTimeline } from "../performance/timeline-stability/fixture"

test("opens the composer model selector from the slash command", async ({ page }) => {
  await setupTimeline(page, { settings: { newLayoutDesigns: true } })
  const input = page.locator('[data-component="session-composer"] [data-component="prompt-input"]')

  await expect(input).toBeVisible()
  await input.focus()
  await page.keyboard.type("/model")
  await page.keyboard.press("Enter")

  await expect(page.getByRole("dialog", { name: "Select model" })).toBeVisible()
})

import { expect, test } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

const directory = "C:/OpenCode/NewSessionModelSelector"

test("keeps the new-session model selector open", async ({ page }) => {
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: "proj_new_session_model_selector",
      worktree: directory,
      vcs: "git",
      name: "new-session-model-selector",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: {
      all: [
        {
          id: "anthropic",
          name: "Anthropic",
          models: { test: { id: "test", name: "Test", limit: { context: 200_000 } } },
        },
      ],
      connected: ["anthropic"],
      default: { providerID: "anthropic", modelID: "test" },
    },
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await page.addInitScript(() => {
    localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
  })

  await page.goto(`/${base64Encode(directory)}/session`)
  const prompt = page.locator('[data-component="prompt-input"]')
  const trigger = page.locator('[data-action="prompt-model"]')
  const menu = page.locator('[data-slot="model-selector-scroll"]')
  await expectAppVisible(trigger)

  await trigger.click()
  await page.waitForTimeout(300)
  await expect(menu).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(menu).not.toBeVisible()
  await page.waitForTimeout(300)
  await prompt.dispatchEvent("opencode:model-select", { bubbles: true })
  await page.waitForTimeout(300)
  await expect(menu).toBeVisible()
})

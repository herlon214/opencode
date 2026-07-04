import { Component, For, Show, createMemo, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { RadioGroup } from "@opencode-ai/ui/radio-group"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSync } from "@/context/server-sync"
import { showToast } from "@/utils/toast"
import type { Config } from "@opencode-ai/sdk/v2/client"
import {
  type FolderEntry,
  entriesFromConfig,
  isShorthandPermission,
  isValidDirPath,
  mergePermissionConfig,
  normalizeDir,
} from "./settings-folder-access.shared"

export const SettingsFolderAccess: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const serverSync = useServerSync()

  const globalConfig = createMemo(() => serverSync().data.config)
  const entries = createMemo(() => entriesFromConfig(globalConfig().permission))

  const [adding, setAdding] = createSignal(false)
  const [manualPath, setManualPath] = createSignal("")
  const [saving, setSaving] = createSignal(false)

  const persist = async (next: FolderEntry[]) => {
    if (isShorthandPermission(globalConfig().permission)) {
      showToast({ title: language.t("settings.folderAccess.toast.shorthand"), variant: "error" })
      return
    }
    setSaving(true)
    try {
      const config: Config = {
        ...globalConfig(),
        permission: mergePermissionConfig(globalConfig().permission, next),
      }
      await serverSync().updateConfig(config)
    } catch (err) {
      showToast({ title: language.t("settings.folderAccess.toast.failed"), variant: "error" })
      throw err
    } finally {
      setSaving(false)
    }
  }

  const addEntry = async (rawPath: string) => {
    const dir = normalizeDir(rawPath)
    if (!dir) return
    if (!isValidDirPath(dir)) {
      showToast({ title: language.t("settings.folderAccess.toast.invalid") })
      return
    }
    const current = entries()
    if (current.some((e) => e.path === dir)) {
      showToast({ title: language.t("settings.folderAccess.toast.duplicate") })
      return
    }
    await persist([...current, { path: dir, write: false }])
  }

  const removeEntry = async (path: string) => {
    const current = entries()
    await persist(current.filter((e) => e.path !== path))
  }

  const toggleWrite = async (path: string, write: boolean) => {
    const current = entries()
    const next = current.map((e) => (e.path === path ? { ...e, write } : e))
    await persist(next)
  }

  const pickFolder = async () => {
    if (platform.platform !== "desktop") {
      setAdding(true)
      return
    }
    const result = await platform.openDirectoryPickerDialog({
      title: language.t("settings.folderAccess.picker.title"),
      multiple: false,
    })
    const picked = Array.isArray(result) ? result[0] : result
    if (!picked) return
    await addEntry(picked)
  }

  const submitManual = async () => {
    const value = manualPath().trim()
    if (!value) return
    setManualPath("")
    setAdding(false)
    await addEntry(value)
  }

  return (
    <div class="flex flex-col gap-1">
      <h3 class="text-14-medium text-text-strong pb-2">{language.t("settings.folderAccess.title")}</h3>
      <p class="text-12-regular text-text-weak pb-2">{language.t("settings.folderAccess.description")}</p>

      <div class="flex flex-col gap-2">
        <Show when={entries().length > 0}>
          <div class="bg-surface-base rounded-lg px-2 py-1">
            <For each={entries()}>
              {(entry) => (
                <div class="flex flex-wrap items-center gap-3 py-2 border-b border-border-weak-base last:border-none sm:flex-nowrap">
                  <div class="flex min-w-0 flex-1 items-center gap-2">
                    <Icon name="folder" size="small" class="text-text-weak shrink-0" />
                    <span class="truncate text-12-regular text-text-strong" title={entry.path}>
                      {entry.path}
                    </span>
                  </div>
                  <div class="flex items-center gap-3 shrink-0">
                    <RadioGroup
                      size="small"
                      pad="none"
                      options={["read", "write"] as const}
                      current={entry.write ? "write" : "read"}
                      onSelect={(value) => void toggleWrite(entry.path, value === "write")}
                      label={(v) =>
                        v === "write"
                          ? language.t("settings.folderAccess.row.readWrite")
                          : language.t("settings.folderAccess.row.readonly")
                      }
                      aria-label={language.t("settings.folderAccess.row.readWrite")}
                    />
                    <IconButton
                      icon="trash"
                      variant="ghost"
                      disabled={saving()}
                      aria-label={language.t("settings.folderAccess.row.remove")}
                      onClick={() => void removeEntry(entry.path)}
                    />
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={!adding()}>
          <div class="flex gap-2">
            <Button
              size="small"
              variant="secondary"
              icon="plus"
              disabled={saving()}
              onClick={() => void pickFolder()}
            >
              {language.t("settings.folderAccess.button.add")}
            </Button>
          </div>
        </Show>

        <Show when={adding()}>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              class="flex-1 bg-surface-base border border-border-weak-base rounded-md px-3 py-2 text-12-regular text-text-strong outline-none focus:border-border-strong-base"
              placeholder={language.t("settings.folderAccess.input.placeholder")}
              value={manualPath()}
              disabled={saving()}
              onInput={(e) => setManualPath(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitManual()
                if (e.key === "Escape") {
                  setManualPath("")
                  setAdding(false)
                }
              }}
              spellcheck={false}
            />
            <div class="flex gap-2">
              <Button size="small" variant="primary" disabled={saving() || !manualPath().trim()} onClick={() => void submitManual()}>
                {language.t("common.save")}
              </Button>
              <Button
                size="small"
                variant="secondary"
                disabled={saving()}
                onClick={() => {
                  setManualPath("")
                  setAdding(false)
                }}
              >
                {language.t("common.cancel")}
              </Button>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
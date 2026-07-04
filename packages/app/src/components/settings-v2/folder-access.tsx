import { Component, For, Show, createMemo, createSignal } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { Switch } from "@opencode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
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
} from "../settings-folder-access.shared"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

export const SettingsFolderAccessV2: Component = () => {
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
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.folderAccess.title")}</h3>
      <p class="settings-v2-folder-access-description">{language.t("settings.folderAccess.description")}</p>

      <Show when={entries().length > 0}>
        <SettingsListV2>
          <For each={entries()}>
            {(entry) => (
              <SettingsRowV2
                title={
                  <div class="settings-v2-folder-access-path">
                    <IconV2 name="folder" size="small" class="text-v2-icon-icon-muted shrink-0" />
                    <span title={entry.path}>{entry.path}</span>
                  </div>
                }
                description={language.t("settings.folderAccess.row.write.description")}
              >
                <div class="settings-v2-folder-access-control">
                  <span class="settings-v2-folder-access-label">
                    {language.t("settings.folderAccess.row.write")}
                  </span>
                  <Switch
                    checked={entry.write}
                    disabled={saving()}
                    onChange={(checked) => void toggleWrite(entry.path, checked)}
                  />
                  <IconButtonV2
                    type="button"
                    variant="ghost-muted"
                    size="small"
                    disabled={saving()}
                    aria-label={language.t("settings.folderAccess.row.remove")}
                    icon={<IconV2 name="trash" size="large" class="text-v2-icon-icon-muted" />}
                    onClick={() => void removeEntry(entry.path)}
                  />
                </div>
              </SettingsRowV2>
            )}
          </For>
        </SettingsListV2>
      </Show>

      <Show
        when={!adding()}
        fallback={
          <div class="settings-v2-folder-access-add">
            <TextInputV2
              type="text"
              appearance="base"
              value={manualPath()}
              onInput={(e) => setManualPath(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitManual()
                if (e.key === "Escape") {
                  setManualPath("")
                  setAdding(false)
                }
              }}
              placeholder={language.t("settings.folderAccess.input.placeholder")}
              spellcheck={false}
              autocorrect="off"
              autocomplete="off"
              autocapitalize="off"
              aria-label={language.t("settings.folderAccess.input.placeholder")}
              disabled={saving()}
            />
            <div class="settings-v2-folder-access-add-actions">
              <ButtonV2
                size="normal"
                variant="contrast"
                disabled={saving() || !manualPath().trim()}
                onClick={() => void submitManual()}
              >
                {language.t("common.save")}
              </ButtonV2>
              <ButtonV2
                size="normal"
                variant="neutral"
                disabled={saving()}
                onClick={() => {
                  setManualPath("")
                  setAdding(false)
                }}
              >
                {language.t("common.cancel")}
              </ButtonV2>
            </div>
          </div>
        }
      >
        <ButtonV2
          size="normal"
          variant="neutral"
          icon="plus"
          disabled={saving()}
          onClick={() => void pickFolder()}
        >
          {language.t("settings.folderAccess.button.add")}
        </ButtonV2>
      </Show>
    </div>
  )
}
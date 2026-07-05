import { type Component, For, Show, createMemo } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import { SettingsListV2 } from "./parts/list"
import "./settings-v2.css"

export const SettingsSkillsV2: Component<{ sessionID?: string }> = (props) => {
  const language = useLanguage()
  const serverSync = useServerSync()

  const directory = createMemo(() => {
    if (props.sessionID) {
      const resolved = serverSync().session.lineage.peek(props.sessionID)?.session.directory
      if (resolved) return resolved
    }
    return serverSync().data.path.directory
  })

  const child = createMemo(() => {
    const dir = directory()
    if (!dir) return undefined
    return serverSync().child(dir)[0]
  })

  const loading = createMemo(() => !child() || !child()?.skill_ready)
  const skills = createMemo(() => (child()?.skill ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)))

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.skills.title")}</h2>
        <Show when={skills().length > 0}>
          <span class="settings-v2-mcp-count">
            {language.t("dialog.skills.count", { total: skills().length })}
          </span>
        </Show>
      </div>

      <div class="settings-v2-tab-body settings-v2-mcp">
        <Show
          when={!loading()}
          fallback={<div class="settings-v2-mcp-status">{language.t("common.loading.ellipsis")}</div>}
        >
          <SettingsListV2>
            <Show
              when={skills().length > 0}
              fallback={<div class="settings-v2-mcp-empty">{language.t("dialog.skills.empty")}</div>}
            >
              <For each={skills()}>
                {(skill) => (
                  <div class="settings-v2-mcp-row">
                    <div class="settings-v2-mcp-lead">
                      <div class="settings-v2-mcp-copy">
                        <div class="settings-v2-mcp-main">
                          <span class="settings-v2-mcp-name truncate">{skill.name}</span>
                          <Show when={skill.slash}>
                            <span class="settings-v2-mcp-status-label">/{skill.name}</span>
                          </Show>
                        </div>
                        <Show when={skill.description}>
                          <span class="settings-v2-mcp-error truncate">{skill.description}</span>
                        </Show>
                        <Show when={skill.location}>
                          <span class="settings-v2-mcp-status-label truncate">{skill.location}</span>
                        </Show>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </SettingsListV2>
        </Show>
      </div>
    </>
  )
}
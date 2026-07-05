import { Switch } from "@opencode-ai/ui/v2/switch-v2"
import { useMutation } from "@tanstack/solid-query"
import { type Component, For, Show, createMemo } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import "./settings-v2.css"

const statusDotClass: Record<string, string> = {
  connected: "bg-icon-success-base",
  failed: "bg-icon-critical-base",
  disabled: "bg-border-weak-base",
  needs_auth: "bg-icon-warning-base",
  needs_client_registration: "bg-icon-warning-base",
}

const statusLabelKey: Record<string, string> = {
  connected: "mcp.status.connected",
  failed: "mcp.status.failed",
  disabled: "mcp.status.disabled",
  needs_auth: "mcp.status.needs_auth",
  needs_client_registration: "mcp.status.needs_client_registration",
}

export const SettingsMcpV2: Component<{ sessionID?: string }> = (props) => {
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
    return serverSync().child(dir, { mcp: true })[0]
  })

  const loading = createMemo(() => !child() || !child()?.mcp_ready)
  const mcpNames = createMemo(() => Object.keys(child()?.mcp ?? {}).sort((a, b) => a.localeCompare(b)))
  const mcpStatus = (name: string) => child()?.mcp[name]
  const connectedCount = createMemo(() => mcpNames().filter((name) => mcpStatus(name)?.status === "connected").length)

  const toggle = useMutation(() => ({
    mutationFn: (name: string) => serverSync().mcp.toggle(directory()!, name),
    onError: (error) =>
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: error instanceof Error ? error.message : String(error),
      }),
  }))

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.mcp.title")}</h2>
        <Show when={mcpNames().length > 0}>
          <span class="settings-v2-mcp-count">
            {language.t("dialog.mcp.description", { enabled: connectedCount(), total: mcpNames().length })}
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
              when={mcpNames().length > 0}
              fallback={<div class="settings-v2-mcp-empty">{language.t("dialog.mcp.empty")}</div>}
            >
            <For each={mcpNames()}>
              {(name) => {
                const status = () => mcpStatus(name)?.status
                const enabled = () => status() === "connected"
                const error = () => {
                  const s = mcpStatus(name)
                  if (s?.status === "failed" || s?.status === "needs_client_registration") return s.error
                }
                const statusLabel = () => {
                  const key = status() ? statusLabelKey[status()!] : undefined
                  if (!key) return
                  return language.t(key)
                }
                const dotClass = () => statusDotClass[status() ?? ""] ?? "bg-border-weak-base"
                return (
                  <div class="settings-v2-mcp-row">
                    <div class="settings-v2-mcp-lead">
                      <span class={`settings-v2-mcp-dot ${dotClass()}`} />
                      <div class="settings-v2-mcp-copy">
                        <div class="settings-v2-mcp-main">
                          <span class="settings-v2-mcp-name truncate">{name}</span>
                          <Show when={statusLabel()}>
                            <span class="settings-v2-mcp-status-label">{statusLabel()}</span>
                          </Show>
                        </div>
                        <Show when={error()}>
                          <span class="settings-v2-mcp-error truncate">{error()}</span>
                        </Show>
                      </div>
                    </div>
                    <div class="settings-v2-mcp-control">
                      <Switch
                        checked={enabled()}
                        disabled={toggle.isPending && toggle.variables === name}
                        onChange={() => {
                          if (toggle.isPending) return
                          toggle.mutate(name)
                        }}
                      >
                        {name}
                      </Switch>
                    </div>
                  </div>
                )
              }}
            </For>
          </Show>
          </SettingsListV2>
        </Show>
      </div>
    </>
  )
}
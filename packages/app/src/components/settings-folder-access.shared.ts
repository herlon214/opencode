import type { PermissionConfig } from "@opencode-ai/sdk/v2/client"

export type PermissionObject = Record<string, "allow" | "ask" | "deny">

export type FolderEntry = {
  path: string
  write: boolean
}

export const GLOB_SUFFIX = "/*"

export function normalizeDir(raw: string): string {
  let p = raw.trim().replace(/\\/g, "/")
  if (p.endsWith("/")) p = p.slice(0, -1)
  return p
}

/**
 * True if the path is a usable external-directory permission root. The server
 * expands `~/` and `$HOME`-prefixed patterns to the home directory, so those
 * are accepted. Bare relative paths are rejected because permission resources
 * are always canonical absolute paths and would silently never match.
 */
export function isValidDirPath(raw: string): boolean {
  const p = normalizeDir(raw)
  if (!p) return false
  if (p === "~") return true
  if (p.startsWith("~/")) return true
  if (p.startsWith("$HOME")) return true
  return p.startsWith("/")
}

export function patternFor(dir: string): string {
  return `${normalizeDir(dir)}${GLOB_SUFFIX}`
}

export function permissionObject(value: unknown): PermissionObject | undefined {
  if (!value) return undefined
  if (typeof value === "string") return { "*": value as "allow" | "ask" | "deny" }
  if (typeof value === "object" && !Array.isArray(value)) return value as PermissionObject
  return undefined
}

/**
 * True when the global permission config is the bare-action shorthand
 * (`"allow"` / `"ask"` / `"deny"`). This form applies to every tool at once
 * and has no per-action fields to merge into, so the folder-access UI must not
 * write through it or it would erase the blanket setting.
 */
export function isShorthandPermission(permission: PermissionConfig | undefined): boolean {
  return typeof permission === "string"
}

export function entriesFromConfig(permission: PermissionConfig | undefined): FolderEntry[] {
  if (!permission || typeof permission === "string") return []
  const external = permissionObject(permission.external_directory)
  const edit = permissionObject(permission.edit)
  if (!external && !edit) return []

  const allowedExternal = new Set<string>()
  if (external) {
    for (const [pattern, action] of Object.entries(external)) {
      if (action === "allow" && pattern.endsWith(GLOB_SUFFIX)) {
        allowedExternal.add(pattern.slice(0, -GLOB_SUFFIX.length))
      }
    }
  }

  const writePaths = new Set<string>()
  if (edit) {
    for (const [pattern, action] of Object.entries(edit)) {
      if (action === "allow" && pattern.endsWith(GLOB_SUFFIX)) {
        const dir = pattern.slice(0, -GLOB_SUFFIX.length)
        if (allowedExternal.has(dir)) writePaths.add(dir)
      }
    }
  }

  return [...allowedExternal].map((dir) => ({ path: dir, write: writePaths.has(dir) }))
}

export function rulesetFromEntries(entries: FolderEntry[]) {
  const external: Record<string, "allow"> = {}
  const edit: Record<string, "allow"> = {}
  for (const entry of entries) {
    const pattern = patternFor(entry.path)
    external[pattern] = "allow"
    if (entry.write) edit[pattern] = "allow"
  }
  return { external, edit }
}

export function mergePermissionConfig(existing: PermissionConfig | undefined, entries: FolderEntry[]): PermissionConfig {
  const next: NonNullable<PermissionConfig> = typeof existing === "string" || !existing ? {} : { ...existing }

  const fresh = rulesetFromEntries(entries)

  const externalObject = permissionObject(next.external_directory) ?? {}
  const editObject = permissionObject(next.edit) ?? {}

  const staleDirs = new Set(entriesFromConfig(existing).map((e) => e.path))
  const cleanExternal: Record<string, "allow" | "ask" | "deny"> = {}
  for (const [pattern, action] of Object.entries(externalObject)) {
    if (pattern.endsWith(GLOB_SUFFIX) && staleDirs.has(pattern.slice(0, -GLOB_SUFFIX.length))) continue
    cleanExternal[pattern] = action
  }
  const cleanEdit: Record<string, "allow" | "ask" | "deny"> = {}
  for (const [pattern, action] of Object.entries(editObject)) {
    if (pattern.endsWith(GLOB_SUFFIX) && staleDirs.has(pattern.slice(0, -GLOB_SUFFIX.length))) continue
    cleanEdit[pattern] = action
  }

  for (const [pattern, action] of Object.entries(fresh.external)) cleanExternal[pattern] = action
  for (const [pattern, action] of Object.entries(fresh.edit)) cleanEdit[pattern] = action

  if (Object.keys(cleanExternal).length > 0) next.external_directory = cleanExternal
  else delete next.external_directory
  if (Object.keys(cleanEdit).length > 0) next.edit = cleanEdit
  else delete next.edit

  return next
}
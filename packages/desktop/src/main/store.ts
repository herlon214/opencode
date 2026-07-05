import Store from "electron-store"
import electron from "electron"
import { rmSync } from "node:fs"
import { join } from "node:path"

import { SETTINGS_STORE } from "./store-keys"
import { deleteStoreFileIfEmpty } from "./store-cleanup"

type CachedStore = {
  store: Store
  data: Record<string, unknown>
}

// Cache of Store instances for internal (non-IPC) callers.
const stores = new Map<string, Store>()

// Shadow cache used by IPC handlers. Kept separate from `stores` so internal
// `getStore().set/delete/clear` callers (migrations, window registry, WSL
// servers) never leave the shadow stale — the shadow is only populated lazily
// by `ensureCached`, which the renderer triggers after migrations have flushed.
const cache = new Map<string, CachedStore>()

// We cannot instantiate the electron-store at module load time because
// module import hoisting causes this to run before app.setPath("userData", ...)
// in index.ts has executed, which would result in files being written to the default directory
// (e.g. bad: %APPDATA%\@opencode-ai\desktop\opencode.settings vs good: %APPDATA%\ai.opencode.desktop.dev\opencode.settings).
export function getStore(name = SETTINGS_STORE) {
  const cached = stores.get(name)
  if (cached) return cached
  const next = new Store({
    name,
    cwd: electron.app.getPath("userData"),
    fileExtension: "",
    accessPropertiesByDotNotation: false,
  })
  stores.set(name, next)
  return next
}

// IPC read helpers. These read from the in-memory shadow so they don't hit
// disk on every call — electron-store's `store` getter does a synchronous
// `readFileSync`, which blocks the main process event loop and freezes the
// renderer during the burst of `store-get` IPC calls that fire when a new
// route mounts its persisted providers.
export function storeGet(name: string, key: string): unknown {
  const cached = ensureCached(name)
  const value = cached.data[key]
  if (value === undefined || value === null) return null
  return typeof value === "string" ? value : JSON.stringify(value)
}

export function storeSet(name: string, key: string, value: string): void {
  const cached = ensureCached(name)
  cached.data[key] = value
  cached.store.set(key, value)
}

export function storeDelete(name: string, key: string): void {
  const cached = ensureCached(name)
  delete cached.data[key]
  cached.store.delete(key)
}

export function storeKeys(name: string): string[] {
  return Object.keys(ensureCached(name).data)
}

export function storeLength(name: string): number {
  return storeKeys(name).length
}

export function storeClear(name: string): void {
  const cached = ensureCached(name)
  cached.data = {}
  cached.store.clear()
}

function ensureCached(name: string): CachedStore {
  const cached = cache.get(name)
  if (cached) return cached
  const store = getStore(name)
  const entry: CachedStore = { store, data: { ...store.store } }
  cache.set(name, entry)
  return entry
}

export async function removeStoreFileIfEmpty(name: string) {
  if (await deleteStoreFileIfEmpty(electron.app.getPath("userData"), name)) {
    cache.delete(name)
    stores.delete(name)
  }
}

export function removeStoreFile(name: string) {
  rmSync(join(electron.app.getPath("userData"), name), { force: true })
  cache.delete(name)
  stores.delete(name)
}

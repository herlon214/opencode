import Store from "electron-store"
import electron from "electron"
import { rmSync } from "node:fs"
import { join } from "node:path"

import { SETTINGS_STORE } from "./store-keys"
import { deleteStoreFileIfEmpty } from "./store-cleanup"

type CachedStore = {
  store: Store
  data: Record<string, unknown>
  dirty: Set<string>
  cleared: boolean
  timer: NodeJS.Timeout | null
}

// electron-store rewrites the entire file synchronously on every `set`, so IPC
// writes are coalesced: mutations land in the in-memory shadow immediately and
// dirty stores are flushed to disk on a short trailing debounce (plus on quit).
const FLUSH_DELAY_MS = 200

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
  cached.dirty.add(key)
  scheduleFlush(cached)
}

export function storeDelete(name: string, key: string): void {
  const cached = ensureCached(name)
  delete cached.data[key]
  cached.dirty.add(key)
  scheduleFlush(cached)
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
  cached.dirty.clear()
  cached.cleared = true
  scheduleFlush(cached)
}

function ensureCached(name: string): CachedStore {
  const cached = cache.get(name)
  if (cached) return cached
  const store = getStore(name)
  const entry: CachedStore = { store, data: { ...store.store }, dirty: new Set(), cleared: false, timer: null }
  cache.set(name, entry)
  return entry
}

function scheduleFlush(cached: CachedStore) {
  registerQuitFlush()
  if (cached.timer) return
  cached.timer = setTimeout(() => flush(cached), FLUSH_DELAY_MS)
}

function flush(cached: CachedStore) {
  if (cached.timer) {
    clearTimeout(cached.timer)
    cached.timer = null
  }

  if (!cached.cleared && cached.dirty.size === 0) return
  cached.cleared = false
  cached.dirty.clear()

  // The shadow is authoritative: direct `getStore()` writers only touch IPC
  // store names during startup migration, before the renderer's first IPC
  // call seeds the shadow, so writing it wholesale can't clobber anyone —
  // and it skips the synchronous disk read that conf's `store` getter
  // performs on every access.
  cached.store.store = { ...cached.data }
}

export function flushAllStores() {
  for (const cached of cache.values()) flush(cached)
}

// app.exit() skips renderer unload handlers, so explicit exit paths ask every
// renderer to flush its debounced persisted writes and wait for the acks. The
// store-set IPC messages a flush issues are queued before the ack on the same
// ordered channel, so once the ack arrives the writes are in the shadow.
export function flushRendererStores(timeoutMs = 1_000): Promise<void> {
  const windows = electron.BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed())
  if (windows.length === 0) return Promise.resolve()
  return new Promise((resolve) => {
    let remaining = windows.length
    const done = () => {
      clearTimeout(timer)
      electron.ipcMain.removeListener("persist-flushed", onAck)
      resolve()
    }
    const onAck = () => {
      remaining -= 1
      if (remaining === 0) done()
    }
    const timer = setTimeout(done, timeoutMs)
    electron.ipcMain.on("persist-flushed", onAck)
    for (const win of windows) win.webContents.send("persist-flush")
  })
}

// Registered lazily on first write so importing this module has no side effects.
let quitFlushRegistered = false
function registerQuitFlush() {
  if (quitFlushRegistered) return
  quitFlushRegistered = true
  electron.app.on("will-quit", flushAllStores)
}

export async function removeStoreFileIfEmpty(name: string) {
  // Flush pending writes first so emptiness is judged on current contents.
  const cached = cache.get(name)
  if (cached) flush(cached)
  if (await deleteStoreFileIfEmpty(electron.app.getPath("userData"), name)) {
    cache.delete(name)
    stores.delete(name)
  }
}

export function removeStoreFile(name: string) {
  const cached = cache.get(name)
  if (cached?.timer) {
    clearTimeout(cached.timer)
    cached.timer = null
  }
  rmSync(join(electron.app.getPath("userData"), name), { force: true })
  cache.delete(name)
  stores.delete(name)
}

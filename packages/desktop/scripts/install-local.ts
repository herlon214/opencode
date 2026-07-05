import { $ } from "bun"
import path from "node:path"
import { fileURLToPath } from "node:url"

const packageDir = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(packageDir, "..", "dist")

if (process.platform !== "darwin") {
  console.log(`install-local: skipping, platform ${process.platform} is not supported`)
  process.exit(0)
}

const arch = process.arch === "arm64" ? "arm64" : "x64"
const appDir = path.join(distDir, `mac-${arch}`)
const appName = "OpenCode.app"
const builtApp = path.join(appDir, appName)
const installDir = "/Applications"
const installedApp = path.join(installDir, appName)

try {
  await $`test -d ${builtApp}`
} catch {
  console.error(`install-local: built app not found at ${builtApp}`)
  process.exit(1)
}

// An app can't overwrite its own bundle while running. If OpenCode is open,
// write a detached shell script that waits for it to exit, swaps the bundle,
// relaunches, and cleans up — the same pattern used by Sparkle/Squirrel.Mac.
const runningPid = (await $`pgrep -x OpenCode`.quiet().nothrow().text()).trim()

if (!runningPid) {
  await swap()
  console.log(`install-local: installed OpenCode.app into /Applications`)
  process.exit(0)
}

console.log(`install-local: OpenCode is running (pid ${runningPid}), scheduling swap on exit`)
await scheduleSwap(runningPid)
console.log(`install-local: OpenCode will be replaced on next launch. Quit OpenCode to apply.`)

async function swap() {
  console.log(`install-local: removing existing ${installedApp} (if present)`)
  await $`rm -rf ${installedApp}`
  console.log(`install-local: copying ${builtApp} -> ${installedApp}`)
  await $`cp -R ${builtApp} ${installedApp}`
}

async function scheduleSwap(pid: string) {
  const script = `#!/bin/bash
set -e
for i in $(seq 1 60); do
  if ! kill -0 ${pid} 2>/dev/null; then break; fi
  sleep 0.5
done
rm -rf "${installedApp}"
cp -R "${builtApp}" "${installedApp}"
open "${installedApp}"
rm -f "$0"
`
  const tmpScript = path.join(appDir, "swap.sh")
  await Bun.write(tmpScript, script)
  await $`chmod +x ${tmpScript}`
  Bun.spawn(["bash", tmpScript], { stdio: ["ignore", "ignore", "ignore"], detached: true }).unref()
}
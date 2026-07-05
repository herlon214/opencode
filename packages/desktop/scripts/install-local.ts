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

console.log(`install-local: removing existing ${installedApp} (if present)`)
try {
  await $`rm -rf ${installedApp}`
} catch {
  // ignore
}

console.log(`install-local: copying ${builtApp} -> ${installedApp}`)
await $`cp -R ${builtApp} ${installedApp}`

console.log(`install-local: installed OpenCode.app into /Applications`)
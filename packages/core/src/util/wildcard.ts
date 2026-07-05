export * as Wildcard from "./wildcard"

export function match(input: string, pattern: string) {
  const normalized = input.replaceAll("\\", "/")
  let escaped = pattern
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")

  if (escaped.endsWith(" .*")) escaped = escaped.slice(0, -3) + "( .*)?"

  return new RegExp("^" + escaped + "$", process.platform === "win32" ? "si" : "s").test(normalized)
}

export function matchPath(input: string, pattern: string) {
  return pathVariants(input).some((variant) => pathVariants(pattern).some((item) => match(variant, item)))
}

function pathVariants(input: string) {
  const normalized = input.replaceAll("\\", "/")
  if (process.platform !== "darwin") return [normalized]
  return Array.from(new Set([normalized, darwinPrivateAlias(normalized)]))
}

function darwinPrivateAlias(input: string) {
  if (input === "/tmp") return "/private/tmp"
  if (input.startsWith("/tmp/")) return "/private" + input
  if (input === "/private/tmp") return "/tmp"
  if (input.startsWith("/private/tmp/")) return input.slice("/private".length)
  if (input === "/var") return "/private/var"
  if (input.startsWith("/var/")) return "/private" + input
  if (input === "/private/var") return "/var"
  if (input.startsWith("/private/var/")) return input.slice("/private".length)
  return input
}

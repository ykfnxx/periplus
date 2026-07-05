import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

let didLoadProjectEnv = false

function stripQuotes(value: string) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseEnvFile(contents: string) {
  const values: Record<string, string> = {}

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line
    const separator = normalized.indexOf("=")
    if (separator < 1) continue

    const key = normalized.slice(0, separator).trim()
    const value = normalized.slice(separator + 1)
    values[key] = stripQuotes(value)
  }

  return values
}

export function loadProjectEnv() {
  if (didLoadProjectEnv) return
  didLoadProjectEnv = true

  const fromFiles: Record<string, string> = {}
  for (const fileName of [".env", ".env.local"]) {
    const filePath = resolve(process.cwd(), fileName)
    if (!existsSync(filePath)) continue
    Object.assign(fromFiles, parseEnvFile(readFileSync(filePath, "utf8")))
  }

  for (const [key, value] of Object.entries(fromFiles)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

export function envString(name: string, fallback = "") {
  loadProjectEnv()
  return process.env[name] || fallback
}

export function envNumber(name: string, fallback: number) {
  const value = envString(name)
  if (!value) return fallback

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function envBoolean(name: string, fallback = false) {
  const value = envString(name)
  if (!value) return fallback
  return !["0", "false", "no", "off"].includes(value.toLowerCase())
}

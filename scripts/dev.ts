import { spawn, type ChildProcess } from "node:child_process"

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"
const services = ["dev:backend", "dev:web"] as const
const children: ChildProcess[] = []
let shuttingDown = false

function stopChildren(signal: NodeJS.Signals, exitCode: number) {
  if (shuttingDown) return

  shuttingDown = true
  process.exitCode = exitCode

  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal)
    }
  }
}

for (const service of services) {
  const child = spawn(npmCommand, ["run", service], {
    env: process.env,
    stdio: "inherit",
  })

  child.on("error", (error) => {
    console.error(`Failed to start ${service}:`, error)
    stopChildren("SIGTERM", 1)
  })

  child.on("exit", (code, signal) => {
    if (shuttingDown) return

    const reason = signal ? `signal ${signal}` : `exit code ${code ?? 1}`
    console.error(`${service} stopped unexpectedly with ${reason}`)
    stopChildren("SIGTERM", code && code > 0 ? code : 1)
  })

  children.push(child)
}

process.once("SIGINT", () => stopChildren("SIGINT", 130))
process.once("SIGTERM", () => stopChildren("SIGTERM", 143))

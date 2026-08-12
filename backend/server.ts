import { createServer } from "node:http"
import { loadProjectEnv } from "@/config/env.server"
import { periplusServerConfig } from "@/config/periplus.server"
import { WorkspaceCommandService } from "@/modules/workspace/server/workspace-command-service"
import { AgentGateway } from "./agent/gateway"
import { PeriplusAgentHarness } from "./agent/periplus-agent-harness"
import { shutdownTelemetry } from "./observability"
import { createAgentWebSocketServer } from "./ws"

loadProjectEnv()

const port = periplusServerConfig.agentBackend.port
const backendUrl = periplusServerConfig.agentBackend.url
const commands = new WorkspaceCommandService()
const harness = new PeriplusAgentHarness({
  apiKey: periplusServerConfig.deepseek.apiKey,
  model: periplusServerConfig.deepseek.model,
  webSearchEnabled: periplusServerConfig.agent.webSearchEnabled,
  timeoutMs: periplusServerConfig.agent.timeoutMs,
})
const agentGateway = new AgentGateway(commands, harness, {})
const server = createServer((_req, res) => {
  res.writeHead(404, { "Content-Type": "application/json" })
  res.end(
    JSON.stringify({
      error: { code: "not_found", message: "Endpoint not found" },
    })
  )
})

createAgentWebSocketServer(server, commands, agentGateway)

server.listen(port, periplusServerConfig.agentBackend.host, () => {
  console.log(`Periplus backend listening on ${backendUrl}`)
})

let shuttingDown = false
const shutdown = async () => {
  if (shuttingDown) return
  shuttingDown = true
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    void shutdownTelemetry()
      .catch(() => undefined)
      .finally(() => process.exit(0))
  }
  const timeout = setTimeout(finish, 5000)
  timeout.unref()
  server.close(() => {
    clearTimeout(timeout)
    finish()
  })
}

process.once("SIGINT", () => void shutdown())
process.once("SIGTERM", () => void shutdown())

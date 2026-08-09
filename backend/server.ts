import { createServer } from "node:http"
import { loadProjectEnv } from "@/config/env.server"
import { periplusServerConfig } from "@/config/periplus.server"
import { WorkspaceCommandService } from "@/modules/workspace/server/workspace-command-service"
import { AgentGateway } from "./agent/gateway"
import { KimiCodeRuntime } from "./agent/runtimes/kimi-code-runtime"
import { PiRuntime } from "./agent/runtimes/pi-runtime"
import { handleInternalRequest } from "./internal-api"
import { shutdownTelemetry } from "./observability"
import { createAgentWebSocketServer } from "./ws"

loadProjectEnv()

const port = periplusServerConfig.agentBackend.port
const backendUrl = periplusServerConfig.agentBackend.url
const commands = new WorkspaceCommandService()
const runtime =
  periplusServerConfig.agentRuntime.kind === "pi"
    ? new PiRuntime({
        binary: periplusServerConfig.pi.bin,
        projectRoot: process.cwd(),
        apiKey: periplusServerConfig.deepseek.apiKey,
        model: periplusServerConfig.deepseek.model,
        timeoutMs: periplusServerConfig.pi.timeoutMs,
      })
    : new KimiCodeRuntime({
        binary: periplusServerConfig.kimi.bin,
        identityHomeSource: periplusServerConfig.kimi.homeSource,
      })
const agentGateway = new AgentGateway(commands, runtime, {
  backendUrl,
  projectRoot: process.cwd(),
})
const server = createServer((req, res) => {
  void handleInternalRequest(req, res, agentGateway).catch((error) => {
    res.writeHead(500, { "Content-Type": "application/json" })
    res.end(
      JSON.stringify({
        error: {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unexpected error",
        },
      })
    )
  })
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

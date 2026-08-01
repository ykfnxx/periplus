import { createServer } from "node:http"
import { loadProjectEnv } from "@/config/env.server"
import { periplusServerConfig } from "@/config/periplus.server"
import { WorkspaceCommandService } from "@/modules/workspace/server/workspace-command-service"
import { AgentGateway } from "./agent/gateway"
import { KimiCodeRuntime } from "./agent/runtimes/kimi-code-runtime"
import { handleInternalRequest } from "./internal-api"
import { createAgentWebSocketServer } from "./ws"

loadProjectEnv()

const port = periplusServerConfig.agentBackend.port
const backendUrl = periplusServerConfig.agentBackend.url
const commands = new WorkspaceCommandService()
const runtime = new KimiCodeRuntime({
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

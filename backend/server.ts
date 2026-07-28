import { createServer } from "node:http"
import { loadProjectEnv } from "@/config/env.server"
import { periplusServerConfig } from "@/config/periplus.server"
import type { AgentEventEmitter } from "./types"

loadProjectEnv()

const [
  { AgentGateway },
  { KimiCodeRuntime },
  { DraftSessionService },
  { WorkspaceCommandService },
  { routePlanningService },
  { handleInternalRequest },
  { createAgentWebSocketServer },
] = await Promise.all([
  import("./agent/gateway"),
  import("./agent/runtimes/kimi-code-runtime"),
  import("@/modules/workspace/server/draft-session-service"),
  import("@/modules/workspace/server/workspace-command-service"),
  import("@/modules/data/routes/route-planning-service"),
  import("./internal-api"),
  import("./ws"),
])

const port = periplusServerConfig.agentBackend.port
const backendUrl = periplusServerConfig.agentBackend.url
const drafts = new DraftSessionService(routePlanningService)
const commands = new WorkspaceCommandService(drafts)
let broadcast: AgentEventEmitter = () => undefined

const server = createServer((req, res) => {
  handleInternalRequest(req, res, drafts, commands, broadcast).catch(
    (error) => {
      res.writeHead(500, { "Content-Type": "application/json" })
      res.end(
        JSON.stringify({
          error: { code: "internal_error", message: error.message },
        })
      )
    }
  )
})
const runtime = new KimiCodeRuntime({
  binary: periplusServerConfig.kimi.bin,
  identityHomeSource: periplusServerConfig.kimi.homeSource,
})
const agentGateway = new AgentGateway(drafts, runtime, {
  backendUrl,
  projectRoot: process.cwd(),
})

broadcast = createAgentWebSocketServer(server, drafts, commands, agentGateway)

server.listen(port, periplusServerConfig.agentBackend.host, () => {
  console.log(`Periplus backend listening on ${backendUrl}`)
})

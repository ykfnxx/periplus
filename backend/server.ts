import { createServer } from "node:http"
import { loadProjectEnv } from "@/config/env.server"
import { periplusServerConfig } from "@/config/periplus.server"
import type { AgentEventEmitter } from "./types"

loadProjectEnv()

const [
  { AgentRunner },
  { DraftStore },
  { handleInternalRequest },
  { createAgentWebSocketServer },
] = await Promise.all([
  import("./agent-runner"),
  import("./draft-store"),
  import("./internal-api"),
  import("./ws"),
])

const port = periplusServerConfig.agentBackend.port
const backendUrl = periplusServerConfig.agentBackend.url
const store = new DraftStore()
let broadcast: AgentEventEmitter = () => undefined

const server = createServer((req, res) => {
  handleInternalRequest(req, res, store, broadcast).catch((error) => {
    res.writeHead(500, { "Content-Type": "application/json" })
    res.end(
      JSON.stringify({
        error: { code: "internal_error", message: error.message },
      })
    )
  })
})
const runner = new AgentRunner(store, {
  backendUrl,
  projectRoot: process.cwd(),
})

broadcast = createAgentWebSocketServer(server, store, runner)

server.listen(port, periplusServerConfig.agentBackend.host, () => {
  console.log(`Periplus backend listening on ${backendUrl}`)
})

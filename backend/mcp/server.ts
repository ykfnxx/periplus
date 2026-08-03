import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { loadProjectEnv } from "@/config/env.server"

loadProjectEnv()

const [
  { registerWorkspaceTools },
  { registerPlaceTools },
  { registerHotelTools },
] = await Promise.all([
  import("./tools/workspace"),
  import("./tools/place"),
  import("./tools/hotel"),
])

const server = new McpServer({
  name: "periplus-workspace",
  version: "0.0.1",
})

registerWorkspaceTools(server)
registerPlaceTools(server)
registerHotelTools(server)

const transport = new StdioServerTransport()
await server.connect(transport)

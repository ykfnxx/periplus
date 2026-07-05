import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { loadProjectEnv } from "@/config/env.server"

loadProjectEnv()

const { registerRouteTools } = await import("@/mcp/tools/routes")

const server = new McpServer({
  name: "periplus",
  version: "0.0.1",
})

registerRouteTools(server)

const transport = new StdioServerTransport()
await server.connect(transport)

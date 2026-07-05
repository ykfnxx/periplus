import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { loadProjectEnv } from "@/config/env.server"

loadProjectEnv()

const { registerDraftTools } = await import("./tools/draft")

const server = new McpServer({
  name: "periplus-draft",
  version: "0.0.1",
})

registerDraftTools(server)

const transport = new StdioServerTransport()
await server.connect(transport)

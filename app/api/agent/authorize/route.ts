import { isAPIError } from "better-auth/api"
import { z } from "zod"
import { authorizeAgent } from "@/modules/agent/server/authorization"
import { AgentAuthorizationError } from "@/modules/agent/contracts"
import { RecordingNotFoundError } from "@/modules/data/journeys/recording-service"
export async function POST(request: Request) {
  try {
    return Response.json(await authorizeAgent(request))
  } catch (error) {
    if (error instanceof AgentAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status })
    if (isAPIError(error))
      return Response.json(
        { error: error.body?.message || error.message },
        { status: error.statusCode }
      )
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json({ error: "授权参数无效" }, { status: 400 })
    if (error instanceof RecordingNotFoundError)
      return Response.json({ error: "没有这篇旅程的访问权限" }, { status: 404 })
    throw error
  }
}

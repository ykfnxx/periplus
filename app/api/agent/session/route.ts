import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { periplusServerConfig } from "@/config/periplus.server"
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth-context"

const agentSessionCookie = "periplus_agent_session"
const agentBackendUrl = periplusServerConfig.agentBackend.url

export async function GET() {
  try {
    const context = await requireCurrentUser()
    const cookieStore = await cookies()
    const existingSessionId = cookieStore.get(agentSessionCookie)?.value

    const backendResponse = await fetch(`${agentBackendUrl}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: existingSessionId,
        userId: context.userId,
        role: context.role,
      }),
      cache: "no-store",
    })

    const body = await backendResponse.json()
    if (!backendResponse.ok) {
      return NextResponse.json(body, { status: backendResponse.status })
    }

    const response = NextResponse.json(body)
    if (body.sessionId && typeof body.sessionId === "string") {
      response.cookies.set(agentSessionCookie, body.sessionId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      })
    }
    return response
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }
    throw error
  }
}

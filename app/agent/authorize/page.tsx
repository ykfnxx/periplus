import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { isAPIError } from "better-auth/api"
import { auth } from "@/modules/auth/server/auth"
import {
  authorizationRequest,
  signedOAuthQuery,
} from "@/modules/agent/server/authorization"
import { listRecordingJourneys } from "@/modules/data/journeys/recording-service"
import AuthorizeForm from "@/modules/agent/react/AuthorizeFormController"
export default async function AuthorizeAgentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const oauthQuery = signedOAuthQuery(await searchParams)
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })
  if (!session) redirect(`/agent/login?${oauthQuery}`)
  let authorization
  try {
    authorization = await authorizationRequest(oauthQuery, requestHeaders)
  } catch (error) {
    if (isAPIError(error) && error.statusCode < 500)
      return (
        <main className="min-h-dvh bg-cream p-8 text-ink">
          授权请求已失效，请从客户端重新连接。
        </main>
      )
    throw error
  }
  const journeys = await listRecordingJourneys({
    userId: session.user.id,
    role: "user",
  })
  return (
    <AuthorizeForm
      key={`${session.user.id}:${oauthQuery}`}
      oauthQuery={oauthQuery}
      account={session.user.email}
      clientName={authorization.client.client_name || authorization.clientId}
      clientOrigin={new URL(authorization.query.get("redirect_uri")!).host}
      requestedScopes={authorization.requestedScopes}
      journeys={journeys}
    />
  )
}

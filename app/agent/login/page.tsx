import { verifyOAuthQueryParams } from "@better-auth/oauth-provider"
import { periplusServerConfig } from "@/config/periplus.server"
import { signedOAuthQuery } from "@/modules/agent/server/authorization"
import AgentLogin from "@/modules/agent/ui/Login"
export default async function AgentLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = signedOAuthQuery(await searchParams)
  if (!(await verifyOAuthQueryParams(query, periplusServerConfig.auth.secret)))
    return (
      <main className="min-h-dvh bg-cream p-8 text-ink">
        授权请求已失效，请从客户端重新连接。
      </main>
    )
  return <AgentLogin oauthQuery={query} />
}

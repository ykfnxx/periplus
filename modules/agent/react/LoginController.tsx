"use client"
import LoginForm from "@/modules/auth/react/LoginFormController"
import AgentLogin from "../ui/Login"
export default function AgentLoginController({ oauthQuery }: { oauthQuery: string }) {
  return <AgentLogin><LoginForm onSwitchToRegister={() => window.location.assign("/")} onAuthenticated={() => window.location.assign(`/agent/authorize?${oauthQuery}`)} /></AgentLogin>
}

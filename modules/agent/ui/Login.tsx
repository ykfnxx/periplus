"use client"
import LoginForm from "@/modules/auth/ui/LoginForm"
export default function AgentLogin({ oauthQuery }: { oauthQuery: string }) {
  return (
    <main className="journal-workbench flex min-h-dvh items-center justify-center bg-cream px-5 py-10 text-ink">
      <section className="w-full max-w-sm space-y-6 rounded-2xl bg-soft-white p-6 shadow-periplus">
        <h1 className="text-xl font-semibold">登录并连接 Agent</h1>
        <LoginForm
          onSwitchToRegister={() => window.location.assign("/")}
          onAuthenticated={() =>
            window.location.assign(`/agent/authorize?${oauthQuery}`)
          }
        />
      </section>
    </main>
  )
}

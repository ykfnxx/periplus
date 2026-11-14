import type { ReactNode } from "react"
export default function AgentLogin({ children }: { children: ReactNode }) {
  return <main className="journal-workbench flex min-h-dvh items-center justify-center bg-cream px-5 py-10 text-ink"><section className="w-full max-w-sm space-y-6 rounded-2xl bg-soft-white p-6 shadow-periplus"><h1 className="text-xl font-semibold">登录并连接 Agent</h1>{children}</section></main>
}

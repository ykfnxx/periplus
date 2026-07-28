"use client"

import { useState } from "react"
import LoginForm from "./LoginForm"
import RegisterForm from "./RegisterForm"

type AuthMode = "entry" | "login" | "register"

export default function LandingGate() {
  const [mode, setMode] = useState<AuthMode>("entry")

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-cream)] px-6 text-[var(--color-ink)]">
      <section className="w-full max-w-sm text-center">
        <h1 className="text-5xl font-black tracking-normal">Periplus</h1>
        <p className="mt-3 text-sm font-bold text-[var(--color-walnut)]">
          旅行轨迹规划平台
        </p>

        {mode === "entry" ? (
          <div className="mt-8 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMode("login")}
              className="flex h-11 items-center justify-center rounded-lg bg-[var(--color-ink)] px-4 text-sm font-black text-[var(--color-soft-white)] transition hover:bg-[var(--color-russet)]"
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className="flex h-11 items-center justify-center rounded-lg border border-[rgb(44_36_22_/_16%)] bg-[var(--color-soft-white)] px-4 text-sm font-black text-[var(--color-ink)] transition hover:border-[var(--color-russet)]"
            >
              注册
            </button>
          </div>
        ) : (
          <div className="mt-8 text-left">
            {mode === "login" ? (
              <LoginForm onSwitchToRegister={() => setMode("register")} />
            ) : (
              <RegisterForm onSwitchToLogin={() => setMode("login")} />
            )}
            <button
              type="button"
              onClick={() => setMode("entry")}
              className="mt-4 w-full text-center text-xs font-bold text-[var(--color-teak)] transition hover:text-[var(--color-russet)]"
            >
              返回
            </button>
          </div>
        )}
      </section>
    </main>
  )
}

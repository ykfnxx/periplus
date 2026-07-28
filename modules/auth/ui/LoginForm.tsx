"use client"

import { useRouter } from "next/navigation"
import { FormEvent, useState } from "react"
import { periplusPublicConfig } from "@/config/periplus"
import { authClient } from "@/modules/auth/client"

interface LoginFormProps {
  onSwitchToRegister: () => void
}

export default function LoginForm({ onSwitchToRegister }: LoginFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setIsSubmitting(true)

    const result = await authClient.signIn.email({
      email,
      password,
      rememberMe: true,
    })

    setIsSubmitting(false)

    if (result.error) {
      setError(result.error.message || "登录失败")
      return
    }

    router.replace("/workspace")
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label
          htmlFor="login-email"
          className="text-xs font-semibold text-walnut"
        >
          邮箱
        </label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          className="h-11 w-full rounded-lg border border-ink-15 bg-soft-white px-3 text-sm transition outline-none focus:border-russet"
        />
      </div>
      <div className="space-y-2">
        <label
          htmlFor="login-password"
          className="text-xs font-semibold text-walnut"
        >
          密码
        </label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
          className="h-11 w-full rounded-lg border border-ink-15 bg-soft-white px-3 text-sm transition outline-none focus:border-russet"
        />
      </div>
      {error && <p className="text-sm font-bold text-coral">{error}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="h-11 w-full rounded-lg bg-ink px-4 text-sm font-bold text-soft-white transition hover:bg-russet disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "登录中..." : "登录"}
      </button>
      <p className="text-center text-sm font-bold text-walnut">
        没有账号？{" "}
        <button
          type="button"
          onClick={onSwitchToRegister}
          className="text-russet"
        >
          注册
        </button>
      </p>
      {periplusPublicConfig.dev.showMockAccounts && (
        <div className="rounded-lg border border-ink-10 bg-soft-white p-3 text-left text-xs leading-5 font-bold text-walnut">
          <p>开发账号：admin@periplus.local</p>
          <p>开发账号：user1@periplus.local</p>
          <p>开发账号：user2@periplus.local</p>
          <p>密码：periplus123</p>
        </div>
      )}
    </form>
  )
}

"use client"

import { useRouter } from "next/navigation"
import { FormEvent, useState } from "react"
import { authClient } from "@/modules/auth/client"

interface RegisterFormProps {
  onSwitchToLogin: () => void
}

export default function RegisterForm({ onSwitchToLogin }: RegisterFormProps) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setIsSubmitting(true)

    const result = await authClient.signUp.email({
      name,
      email,
      password,
    })

    setIsSubmitting(false)

    if (result.error) {
      setError(result.error.message || "注册失败")
      return
    }

    router.replace("/workspace")
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label
          htmlFor="register-name"
          className="text-xs font-semibold text-walnut"
        >
          名称
        </label>
        <input
          id="register-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoComplete="name"
          className="h-11 w-full rounded-lg border border-ink-15 bg-soft-white px-3 text-sm transition outline-none focus:border-russet"
        />
      </div>
      <div className="space-y-2">
        <label
          htmlFor="register-email"
          className="text-xs font-semibold text-walnut"
        >
          邮箱
        </label>
        <input
          id="register-email"
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
          htmlFor="register-password"
          className="text-xs font-semibold text-walnut"
        >
          密码
        </label>
        <input
          id="register-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="h-11 w-full rounded-lg border border-ink-15 bg-soft-white px-3 text-sm transition outline-none focus:border-russet"
        />
      </div>
      {error && <p className="text-sm font-bold text-coral">{error}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="h-11 w-full rounded-lg bg-ink px-4 text-sm font-bold text-soft-white transition hover:bg-russet disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "注册中..." : "注册"}
      </button>
      <p className="text-center text-sm font-bold text-walnut">
        已有账号？{" "}
        <button type="button" onClick={onSwitchToLogin} className="text-russet">
          登录
        </button>
      </p>
    </form>
  )
}

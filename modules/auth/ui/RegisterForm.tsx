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
          className="text-xs font-black text-[var(--periplus-walnut)]"
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
          className="h-11 w-full rounded-lg border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-soft-white)] px-3 text-sm transition outline-none focus:border-[var(--periplus-russet)]"
        />
      </div>
      <div className="space-y-2">
        <label
          htmlFor="register-email"
          className="text-xs font-black text-[var(--periplus-walnut)]"
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
          className="h-11 w-full rounded-lg border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-soft-white)] px-3 text-sm transition outline-none focus:border-[var(--periplus-russet)]"
        />
      </div>
      <div className="space-y-2">
        <label
          htmlFor="register-password"
          className="text-xs font-black text-[var(--periplus-walnut)]"
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
          className="h-11 w-full rounded-lg border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-soft-white)] px-3 text-sm transition outline-none focus:border-[var(--periplus-russet)]"
        />
      </div>
      {error && (
        <p className="text-sm font-bold text-[var(--periplus-coral)]">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={isSubmitting}
        className="h-11 w-full rounded-lg bg-[var(--periplus-ink)] px-4 text-sm font-black text-[var(--periplus-soft-white)] transition hover:bg-[var(--periplus-russet)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "注册中..." : "注册"}
      </button>
      <p className="text-center text-sm font-bold text-[var(--periplus-walnut)]">
        已有账号？{" "}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-[var(--periplus-russet)]"
        >
          登录
        </button>
      </p>
    </form>
  )
}

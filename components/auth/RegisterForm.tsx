"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useState } from "react"
import { authClient } from "@/lib/auth-client"

export default function RegisterForm() {
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

    router.replace("/")
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-black text-[var(--periplus-walnut)]">
          名称
        </label>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoComplete="name"
          className="h-11 w-full rounded-lg border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-soft-white)] px-3 text-sm transition outline-none focus:border-[var(--periplus-russet)]"
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-black text-[var(--periplus-walnut)]">
          邮箱
        </label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          className="h-11 w-full rounded-lg border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-soft-white)] px-3 text-sm transition outline-none focus:border-[var(--periplus-russet)]"
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-black text-[var(--periplus-walnut)]">
          密码
        </label>
        <input
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
        <Link href="/login" className="text-[var(--periplus-russet)]">
          登录
        </Link>
      </p>
    </form>
  )
}

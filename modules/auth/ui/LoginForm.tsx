"use client"

import { Button } from "@/components/kumo/components/button/button"
import { Input } from "@/components/kumo/components/input/input"
import { useRouter } from "next/navigation"
import { FormEvent, useState } from "react"
import { authClient } from "@/modules/auth/client"

interface LoginFormProps {
  onSwitchToRegister: () => void
  onAuthenticated?: () => void
}

export default function LoginForm({
  onSwitchToRegister,
  onAuthenticated,
}: LoginFormProps) {
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

    if (onAuthenticated) onAuthenticated()
    else {
      router.replace("/journeys")
      router.refresh()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="邮箱"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        autoComplete="email"
      />
      <Input
        label="密码"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        autoComplete="current-password"
      />
      {error && (
        <p role="alert" className="text-sm text-coral">
          {error}
        </p>
      )}
      <Button
        variant="primary"
        className="w-full justify-center!"
        type="submit"
        loading={isSubmitting}
      >
        登录
      </Button>
      <p className="flex items-center justify-center text-sm text-walnut">
        没有账号？
        <Button variant="ghost" onClick={onSwitchToRegister}>
          注册
        </Button>
      </p>
    </form>
  )
}

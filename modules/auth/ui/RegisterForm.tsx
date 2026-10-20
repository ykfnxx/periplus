"use client"

import { Button } from "@/components/kumo/components/button/button"
import { Input } from "@/components/kumo/components/input/input"
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

    router.replace("/journeys")
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="名称"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        autoComplete="name"
      />
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
        minLength={8}
        autoComplete="new-password"
      />
      {error && (
        <p role="alert" className="text-sm text-coral">
          {error}
        </p>
      )}
      <Button
        variant="primary"
        className="w-full"
        type="submit"
        loading={isSubmitting}
      >
        注册
      </Button>
      <p className="flex items-center justify-center text-sm text-walnut">
        已有账号？
        <Button variant="ghost" onClick={onSwitchToLogin}>
          登录
        </Button>
      </p>
    </form>
  )
}

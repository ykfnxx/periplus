"use client"

import { useRouter } from "next/navigation"
import { FormEvent, useState } from "react"
import { authApi } from "../adapters/better-auth"
import { authenticate } from "../application/authenticate"
import LoginFormView from "../ui/LoginForm"

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

    try {
      const result = await authenticate(authApi, {
        mode: "login",
        email,
        password,
      })
      if (result.redirecting) return
      if (onAuthenticated) onAuthenticated()
      else {
        router.replace("/journeys")
        router.refresh()
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <LoginFormView
      email={email}
      password={password}
      error={error}
      isSubmitting={isSubmitting}
      handleSubmit={handleSubmit}
      setEmail={setEmail}
      setPassword={setPassword}
      onSwitchToRegister={onSwitchToRegister}
    />
  )
}

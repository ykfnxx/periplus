"use client"

import { useRouter } from "next/navigation"
import { FormEvent, useState } from "react"
import { authApi } from "../adapters/better-auth"
import { authenticate } from "../application/authenticate"
import RegisterFormView from "../ui/RegisterForm"

interface RegisterFormProps {
  onSwitchToLogin: () => void
  onAuthenticated?: () => void
}

export default function RegisterForm({
  onSwitchToLogin,
  onAuthenticated,
}: RegisterFormProps) {
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

    try {
      const result = await authenticate(authApi, {
        mode: "register",
        email,
        password,
        name,
      })
      if (result.redirecting) return
      if (onAuthenticated) onAuthenticated()
      else {
        router.replace("/journeys")
        router.refresh()
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "注册失败")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <RegisterFormView
      email={email}
      password={password}
      error={error}
      isSubmitting={isSubmitting}
      handleSubmit={handleSubmit}
      setEmail={setEmail}
      setPassword={setPassword}
      onSwitchToLogin={onSwitchToLogin}
      name={name}
      setName={setName}
    />
  )
}

"use client"
import type { FormEvent } from "react"
import { Button } from "@/components/kumo/components/button/button"
import { Input } from "@/components/kumo/components/input/input"
export default function LoginForm({
  email,
  password,
  error,
  isSubmitting,
  handleSubmit,
  setEmail,
  setPassword,
  onSwitchToRegister,
}: {
  email: string
  password: string
  error: string
  isSubmitting: boolean
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void
  setEmail: (value: string) => void
  setPassword: (value: string) => void
  onSwitchToRegister: () => void
}) {
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

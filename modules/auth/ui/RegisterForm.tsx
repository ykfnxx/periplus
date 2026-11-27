"use client"
import PasswordField from "./PasswordField"
import type { FormEvent } from "react"
import { Button } from "@/components/kumo/components/button/button"
import { Input } from "@/components/kumo/components/input/input"
export default function RegisterForm({
  inviteCode,
  setInviteCode,
  cowrite = false,
  email,
  password,
  error,
  isSubmitting,
  handleSubmit,
  setEmail,
  setPassword,
  onSwitchToLogin,
  name,
  setName,
}: {
  inviteCode: string
  setInviteCode: (v: string) => void
  cowrite?: boolean
  email: string
  password: string
  error: string
  isSubmitting: boolean
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void
  setEmail: (value: string) => void
  setPassword: (value: string) => void
  onSwitchToLogin: () => void
  name: string
  setName: (value: string) => void
}) {
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {cowrite ? (
        <p className="rounded-lg bg-journal-paper-soft p-3 text-sm">
          凭此共写邀请可直接注册，注册后即可加入旅程。
        </p>
      ) : (
        <Input
          label="邀请码"
          required
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          placeholder="PERI-XXXX-XXXX"
          autoCapitalize="characters"
          spellCheck={false}
          autoComplete="off"
        />
      )}
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
      <PasswordField
        value={password}
        onChange={setPassword}
        newPassword={true}
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
        完成注册
      </Button>
      <p className="flex items-center justify-center text-sm text-walnut">
        已有账号？
        <Button type="button" variant="ghost" onClick={onSwitchToLogin}>
          登录
        </Button>
      </p>
    </form>
  )
}

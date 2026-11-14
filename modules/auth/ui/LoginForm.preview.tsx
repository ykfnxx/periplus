"use client"
import { useState } from "react"
import LoginForm from "./LoginForm"
export default function LoginFormPreview({ variant }: { variant: string }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [sent, setSent] = useState(false)
  return (
    <section className="mx-auto mt-24 max-w-sm rounded-2xl bg-soft-white p-7">
      <LoginForm
        email={email}
        password={password}
        setEmail={setEmail}
        setPassword={setPassword}
        isSubmitting={variant === "busy"}
        error={
          variant === "error"
            ? "邮箱或密码不正确"
            : sent
              ? "预览表单已提交"
              : ""
        }
        handleSubmit={(event) => {
          event.preventDefault()
          setSent(true)
        }}
        onSwitchToRegister={() => {}}
      />
    </section>
  )
}

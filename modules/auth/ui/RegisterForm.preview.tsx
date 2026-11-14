"use client"
import { useState } from "react"
import RegisterForm from "./RegisterForm"
export default function RegisterFormPreview({ variant }: { variant: string }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  return (
    <section className="mx-auto mt-24 max-w-sm rounded-2xl bg-soft-white p-7">
      <RegisterForm
        email={email}
        password={password}
        name={name}
        setName={setName}
        setEmail={setEmail}
        setPassword={setPassword}
        isSubmitting={variant === "busy"}
        error={variant === "error" ? "这个邮箱已注册" : ""}
        handleSubmit={(event) => event.preventDefault()}
        onSwitchToLogin={() => {}}
      />
    </section>
  )
}

"use client"
import AuthSplitLayout from "./AuthSplitLayout"
import { useState } from "react"
import RegisterForm from "./RegisterForm"
export default function RegisterFormPreview({ variant }: { variant: string }) {
  const [code, setCode] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  return (
    <AuthSplitLayout register>
      <RegisterForm
        inviteCode={code}
        setInviteCode={setCode}
        cowrite={variant === "conflict"}
        email={email}
        password={password}
        name={name}
        setName={setName}
        setEmail={setEmail}
        setPassword={setPassword}
        isSubmitting={variant === "busy"}
        error={variant === "error" ? "邀请码已用完，请向邀请人索取新码。" : ""}
        handleSubmit={(event) => event.preventDefault()}
        onSwitchToLogin={() => {}}
      />
    </AuthSplitLayout>
  )
}

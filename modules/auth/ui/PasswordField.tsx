"use client"
import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/kumo/components/input/input"

export default function PasswordField({
  value,
  onChange,
  newPassword,
}: {
  value: string
  onChange: (value: string) => void
  newPassword: boolean
}) {
  const [visible, setVisible] = useState(false)
  const Icon = visible ? EyeOff : Eye
  return (
    <div className="relative">
      <Input
        label="密码"
        className="pr-12"
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={newPassword ? 8 : undefined}
        placeholder={newPassword ? "至少 8 位" : undefined}
        autoComplete={newPassword ? "new-password" : "current-password"}
      />
      <button
        type="button"
        aria-label={visible ? "隐藏密码" : "显示密码"}
        aria-pressed={visible}
        className="absolute right-1 bottom-0 grid size-9 place-items-center text-journal-muted"
        onClick={() => setVisible(!visible)}
      >
        <Icon size={17} />
      </button>
    </div>
  )
}

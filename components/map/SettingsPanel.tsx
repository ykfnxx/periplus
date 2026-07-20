"use client"

import { LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { authClient } from "@/lib/auth-client"

export default function SettingsPanel() {
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState("")

  async function handleSignOut() {
    setError("")
    setIsSigningOut(true)

    const result = await authClient.signOut()
    setIsSigningOut(false)

    if (result.error) {
      setError(result.error.message || "退出登录失败")
      return
    }

    router.replace("/")
    router.refresh()
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold text-ink">设置</h2>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isSigningOut}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-ink-15 bg-white px-3 text-sm font-bold text-ink transition hover:border-russet hover:text-russet disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        {isSigningOut ? "退出中..." : "退出登录"}
      </button>
      {error && (
        <p className="text-xs leading-5 font-bold text-coral">
          {error}
        </p>
      )}
    </section>
  )
}

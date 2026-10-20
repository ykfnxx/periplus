"use client"
import dynamic from "next/dynamic"
import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Button } from "@/components/kumo/components/button/button"
import LoginForm from "./LoginForm"
import RegisterForm from "./RegisterForm"
const RecordMap = dynamic(() => import("@/modules/travelogue/ui/RecordMap"), {
  ssr: false,
})
export default function LandingGate() {
  const [mode, setMode] = useState<"entry" | "login" | "register">("entry")
  const reduced = useReducedMotion()
  return (
    <main className="journal-workbench journal-entry fixed inset-0 isolate flex items-center justify-center bg-cream px-6 text-ink">
      <div className="absolute inset-0">
        <RecordMap points={[]} />
      </div>
      <section className="journal-panel relative max-h-[calc(100dvh-32px)] w-full max-w-sm overflow-y-auto rounded-2xl border border-ink-10 bg-soft-white p-7 shadow-periplus">
        <h1 className="text-center text-3xl font-black">我的旅程</h1>
        <p className="mt-3 text-center text-sm text-walnut">
          把走过的路，慢慢记下来。
        </p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            className="mt-8"
            initial={{ opacity: 0, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.15 }}
          >
            {mode === "entry" ? (
              <div className="grid grid-cols-2 gap-3">
                <Button variant="primary" onClick={() => setMode("login")}>
                  登录
                </Button>
                <Button variant="secondary" onClick={() => setMode("register")}>
                  注册
                </Button>
              </div>
            ) : (
              <>
                {mode === "login" ? (
                  <LoginForm onSwitchToRegister={() => setMode("register")} />
                ) : (
                  <RegisterForm onSwitchToLogin={() => setMode("login")} />
                )}
                <Button
                  variant="ghost"
                  className="mt-4 w-full"
                  onClick={() => setMode("entry")}
                >
                  返回
                </Button>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </section>
    </main>
  )
}

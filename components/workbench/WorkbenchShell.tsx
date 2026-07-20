"use client"

import { useMapStore } from "@/stores/mapStore"
import AgentSync from "./AgentSync"
import AIComposer from "./AIComposer"
import ChatHistory from "./ChatHistory"
import InitialChatState from "./InitialChatState"
import RoutePreview from "./RoutePreview"

const tabs = [
  { value: "preview", label: "Preview" },
  { value: "chat", label: "Chat" },
] as const

export default function WorkbenchShell() {
  const chatMessages = useMapStore((state) => state.chatMessages)
  const isDraftLocked = useMapStore((state) => state.isDraftLocked)
  const workbenchTab = useMapStore((state) => state.workbenchTab)
  const setWorkbenchTab = useMapStore((state) => state.setWorkbenchTab)
  const showInitialState = chatMessages.length === 0 && !isDraftLocked

  return (
    <>
      <AgentSync />
      <section className="pointer-events-none absolute top-5 bottom-5 left-5 z-20 w-[min(420px,calc(100vw-40px))]">
        <div className="pointer-events-auto flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-ink-15 bg-soft-white/95 shadow-periplus backdrop-blur-sm">
          <div className="border-b border-ink-10 px-4 pt-4 pb-3">
            <div className="flex rounded-full bg-ink-5 p-1">
              {tabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setWorkbenchTab(tab.value)}
                  className={`h-8 flex-1 rounded-full text-xs font-bold transition ${
                    workbenchTab === tab.value
                      ? "bg-soft-white text-ink shadow-[0_4px_12px_var(--color-ink-10)]"
                      : "text-teak hover:text-ink"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {workbenchTab === "preview" ? (
            <>
              <div className="periplus-chat-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
                <RoutePreview />
              </div>
              <div className="px-5 pt-1 pb-3">
                <AIComposer />
              </div>
            </>
          ) : showInitialState ? (
            <InitialChatState />
          ) : (
            <>
              <div className="periplus-chat-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 pt-4">
                <ChatHistory />
              </div>
              <div className="px-5 pt-1 pb-3">
                <AIComposer />
              </div>
            </>
          )}
        </div>
      </section>
    </>
  )
}

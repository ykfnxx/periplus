"use client"

import { useMapStore } from "@/stores/mapStore"
import AgentSync from "./AgentSync"
import AIComposer from "./AIComposer"
import ChatHistory from "./ChatHistory"
import InitialChatState from "./InitialChatState"

export default function WorkbenchShell() {
  const chatMessages = useMapStore((state) => state.chatMessages)
  const isDraftLocked = useMapStore((state) => state.isDraftLocked)
  const showInitialState = chatMessages.length === 0 && !isDraftLocked

  return (
    <>
      <AgentSync />
      <section className="pointer-events-none absolute top-5 bottom-5 left-5 z-20 w-[min(420px,calc(100vw-40px))]">
        <div className="pointer-events-auto flex h-full min-h-0 flex-col overflow-hidden rounded-[12px] border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-soft-white)]/95 shadow-[var(--periplus-shadow)] backdrop-blur-sm">
          {showInitialState ? (
            <InitialChatState />
          ) : (
            <>
              <div className="periplus-chat-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 pt-10">
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

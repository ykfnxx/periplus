"use client"

import AgentSync from "./AgentSync"
import AIComposer from "./AIComposer"
import ChatHistory from "./ChatHistory"
import PresetPromptBubbles from "./PresetPromptBubbles"

export default function WorkbenchShell() {
  return (
    <>
      <AgentSync />
      <section className="pointer-events-none absolute top-5 bottom-5 left-5 z-20 w-[min(420px,calc(100vw-40px))]">
        <div className="pointer-events-auto flex h-full min-h-0 flex-col overflow-hidden rounded-[12px] border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-soft-white)]/95 shadow-[var(--periplus-shadow)] backdrop-blur-sm">
          <div className="periplus-chat-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-4 pr-2 pl-4">
            <PresetPromptBubbles />
            <ChatHistory />
          </div>
          <div className="px-3 pt-1 pb-3">
            <AIComposer />
          </div>
        </div>
      </section>
    </>
  )
}

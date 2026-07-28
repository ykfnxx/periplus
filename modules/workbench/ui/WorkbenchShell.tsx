"use client"

import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import AIComposer from "./AIComposer"
import ChatHistory from "./ChatHistory"
import InitialChatState from "./InitialChatState"
import RoutePreview from "./RoutePreview"

const tabs = [
  { value: "preview", label: "Preview" },
  { value: "chat", label: "Chat" },
] as const

export default function WorkbenchShell() {
  const chatMessages = useWorkspaceStore((state) => state.chatMessages)
  const isDraftLocked = useWorkspaceStore((state) => state.isDraftLocked)
  const workbenchTab = useWorkspaceStore((state) => state.workbenchTab)
  const setWorkbenchTab = useWorkspaceStore((state) => state.setWorkbenchTab)
  const isPickingUploadPhotoLocation = useWorkspaceStore(
    (state) =>
      state.isSelectingLocation &&
      state.locationSelectionMode === "upload-photo"
  )
  const showInitialState = chatMessages.length === 0 && !isDraftLocked

  if (isPickingUploadPhotoLocation) return null

  return (
    <section className="pointer-events-none absolute top-5 bottom-5 left-5 z-20 w-[min(420px,calc(100vw-40px))]">
      <div className="pointer-events-auto flex h-full min-h-0 flex-col overflow-hidden rounded-[12px] border border-[rgb(44_36_22_/_14%)] bg-[var(--color-soft-white)]/95 shadow-[var(--shadow-periplus)] backdrop-blur-sm">
        <div className="border-b border-[rgb(44_36_22_/_10%)] px-4 pt-4 pb-3">
          <div className="flex rounded-full bg-[rgb(44_36_22_/_6%)] p-1">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setWorkbenchTab(tab.value)}
                className={`h-8 flex-1 rounded-full text-xs font-bold transition ${
                  workbenchTab === tab.value
                    ? "bg-[var(--color-soft-white)] text-[var(--color-ink)] shadow-[0_4px_12px_rgb(44_36_22_/_8%)]"
                    : "text-[var(--color-teak)] hover:text-[var(--color-ink)]"
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
  )
}

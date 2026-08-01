import { createChatMessage } from "@/modules/workspace/state/helpers"
import type {
  AgentSlice,
  WorkspaceSlice,
} from "@/modules/workspace/state/types"

export const createAgentSlice: WorkspaceSlice<AgentSlice> = (set) => ({
  agentMode: "auto",
  setAgentMode: (agentMode) => set({ agentMode }),
  chatMessages: [],
  addUserMessage: (content) =>
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        createChatMessage("user", content),
      ].slice(-80),
    })),
  appendAssistantMessage: (content) =>
    set((state) => ({
      chatMessages:
        state.chatMessages.at(-1)?.role === "assistant"
          ? state.chatMessages.map((message, index) =>
              index === state.chatMessages.length - 1
                ? { ...message, content: message.content + content }
                : message
            )
          : [
              ...state.chatMessages,
              createChatMessage("assistant", content),
            ].slice(-80),
    })),
  setChatMessages: (chatMessages) => set({ chatMessages }),
  clearChatMessages: () => set({ chatMessages: [] }),
  sendAgentEvent: null,
  setAgentSender: (sendAgentEvent) => set({ sendAgentEvent }),
})

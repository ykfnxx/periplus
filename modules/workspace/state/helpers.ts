import type {
  ChatMessage,
  ChatMessageRole,
} from "@/modules/workspace/state/types"

export function createChatMessage(
  role: ChatMessageRole,
  content: string
): ChatMessage {
  return { id: `message-${Date.now()}-${Math.random()}`, role, content }
}

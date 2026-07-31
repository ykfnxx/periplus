import {
  JOURNEY_TOOL_NAMES,
  type AgentConversationMessage,
} from "@/modules/workspace/server/contracts"
import type { AgentMode } from "../types"

function formatConversationMessage(message: AgentConversationMessage) {
  return `${message.role === "user" ? "用户" : "Agent"}：\n${message.content}`
}

function basePrompt(messages: AgentConversationMessage[]) {
  return [
    "你是 Periplus 的旅程规划 Agent。",
    "所有修改都必须通过 typed JourneyEvent 工具作用于当前草稿；保存由用户在前端触发。",
    "SECTION 只用于层级分组，VISIT/STAY/MEAL/ACTIVITY/TRANSIT 才是可执行事件；TRANSIT 必须是显式事件。",
    "修改前读取当前 revision；每个修改工具都传 expectedRevision 和唯一 idempotencyKey，成功后使用返回的新 revision。",
    "下面是当前会话从开始到现在的完整上下文，请基于历史继续对话，只执行最后一条用户需求。",
    "",
    "完整对话：",
    messages.map(formatConversationMessage).join("\n\n"),
  ]
}

export function buildPrompt(
  messages: AgentConversationMessage[],
  mode: AgentMode = "auto",
  draftJson = "{}"
) {
  if (mode === "suggest") {
    return [
      ...basePrompt(messages),
      "",
      "当前模式：Suggest。",
      "禁止调用 MCP 工具，禁止修改草稿。",
      "你只能输出一个 JSON 对象，不能输出 Markdown 代码块以外的解释文字。",
      "JSON 格式：",
      JSON.stringify(
        {
          title: "简短建议标题",
          summary: "给用户看的简短变更摘要",
          toolCalls: [
            {
              tool: "journey.update_event",
              input: {
                expectedRevision: 3,
                idempotencyKey: "suggestion-update-event-1",
                eventId: "event-id",
                patch: { description: "新的备注" },
              },
            },
          ],
        },
        null,
        2
      ),
      "",
      `允许的 tool 值：${JOURNEY_TOOL_NAMES.filter(
        (name) => name !== "get_current_journey"
      ).join(", ")}`,
      "",
      "当前草稿快照：",
      draftJson,
    ].join("\n")
  }

  return [
    ...basePrompt(messages),
    "只能通过 MCP 工具读取和修改当前草稿，不要读写项目文件，不要直接连接数据库。",
  ].join("\n")
}

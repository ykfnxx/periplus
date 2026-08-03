import type { AgentConversationMessage } from "@/backend/types"
import type { AgentMode } from "../types"

function formatConversationMessage(message: AgentConversationMessage) {
  return `${message.role === "user" ? "用户" : "Agent"}：\n${message.content}`
}

const journeyPlanningProtocol = [
  "行程图只允许两级 Scope：Root Scope 与 City Scope。",
  "Root Scope 必须由 CITY 与跨城 TRANSIT 交替组成；不得创建 DAY Section。",
  "City Scope 直接包含该城市全部日期的 VISIT、MEAL、ACTIVITY 与市内 TRANSIT；日期由后端依据 CITY.detail.timeZone 和 plannedStartAt 切分。",
  "每个地点事件必须填写 plannedStartAt；CITY.detail.timeZone 必须使用 IANA 时区名称。",
  "同一天相邻地点必须通过显式 TRANSIT 及前后 Link 串联，并调用 journey.plan_transit 得到 READY 路线。",
]

function basePrompt(messages: AgentConversationMessage[]) {
  return [
    "你是 Periplus 的旅程规划 Agent。",
    "所有修改都必须通过 typed Workspace command 工具作用于持久 Workspace；禁止直接写数据库。",
    "SECTION 只用于层级分组，VISIT/STAY/MEAL/ACTIVITY/TRANSIT 才是可执行事件；TRANSIT 必须是显式事件。",
    "修改前读取 headWorkspaceRevision；每个 command 都传 expectedRevision 和唯一 idempotencyKey，成功后使用返回的新 revision。",
    "任何有序路线、分支选择、位置序号或时间视图都必须调用 periplus.workspace.project 获取；workspace.get 的 canonical graph 只用于定位编辑对象，禁止自行排序 Links/Events。",
    ...journeyPlanningProtocol,
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
      "禁止调用 MCP 工具，禁止修改 Workspace。",
      "你只能输出一个 JSON 对象，不能输出 Markdown 代码块以外的解释文字。",
      "JSON 格式：",
      JSON.stringify(
        {
          title: "简短建议标题",
          summary: "给用户看的简短变更摘要",
          basedOnWorkspaceRevision: 3,
          commands: [
            {
              expectedRevision: 3,
              idempotencyKey: "suggestion-update-event-1",
              command: {
                name: "journey.update_event",
                payload: {
                  eventId: "event-id",
                  patch: { type: "VISIT", description: "新的备注" },
                },
              },
            },
          ],
        },
        null,
        2
      ),
      "",
      "commands.command 必须符合 TargetCommandBody（例如 journey.update_event / journey.select_branch / journey.undo）。",
      "",
      "当前 Workspace 快照：",
      draftJson,
    ].join("\n")
  }

  return [
    ...basePrompt(messages),
    "只能通过 MCP 工具读取和修改当前 Workspace，不要读写项目文件，不要直接连接数据库。",
    "用户要求酒店推荐时，只有城市、入住日期、晚数和入住人数明确才调用 periplus.hotel.search；信息不明确先追问。完整候选只显示在持久化卡片中，工具仅返回首位 firstCandidate 和对应的 stayDetail；写入 STAY 时必须使用该 stayDetail。新增 STAY 时放入当前明确的 CITY Scope；已有明确 STAY 时用 journey.update_event 更新其标题、地点和 hotelOffer 快照。",
    "完成全部修改后必须调用 periplus.workspace.validate_plan，并传入最新 headWorkspaceRevision。",
    "如果 valid=false，只按 issues 修复并使用最新 revision 再次校验，最多修复三轮；只有 valid=true 且之后未再修改 Workspace 才能向用户声明完成。",
  ].join("\n")
}

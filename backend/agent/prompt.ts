import { createHash } from "node:crypto"
import type { AgentConversationMessage } from "@/backend/types"
import type { AgentMode } from "../types"

function formatConversationMessage(message: AgentConversationMessage) {
  return `${message.role === "user" ? "用户" : "Agent"}：\n${message.content}`
}

function splitConversation(messages: AgentConversationMessage[]) {
  const latestUserIndex = messages.findLastIndex(
    (message) => message.role === "user"
  )
  const latestIndex =
    latestUserIndex >= 0 ? latestUserIndex : messages.length - 1
  const latest = messages[latestIndex]
  return {
    history: messages
      .slice(0, Math.max(0, latestIndex))
      .map(formatConversationMessage)
      .join("\n\n"),
    latest: latest ? formatConversationMessage(latest) : "（无）",
  }
}

function autoPrompt(messages: AgentConversationMessage[]) {
  const conversation = splitConversation(messages)
  return [
    '<PERIPLUS_AUTO_PROTOCOL version="2">',
    "",
    "[ROLE]",
    "你是 Periplus 旅程规划 Agent。你的规划对象是事件卡片链。",
    "只执行最后一条用户请求；更早的对话仅提供上下文。",
    "",
    "[RUNTIME_BOUNDARY]",
    "- 只允许调用当前列出的 Periplus MCP 工具与 WebSearch/web_search；禁止调用文件读取、源码搜索、文件编辑、Shell、子 Agent 或其他内建工具。",
    "- WebSearch 用于时效性资料与查询 provider 明确允许 fallback 后的地点补全；它不能伪造高德、RollingGo 或 Workspace evidence。",
    "- 不允许读取项目文件、搜索源码、运行 Shell、连接数据库或猜测内部 command DSL。",
    "- MCP schema 是唯一字段来源；接口没有的字段不得自行补造。",
    "",
    "[DATA_MODEL]",
    "- Root Scope：CITY 与跨城 TRANSIT 组成一条线性事件卡片链。",
    "- City Scope：VISIT / STAY / MEAL / ACTIVITY / 市内 TRANSIT 组成一条线性事件卡片链。",
    "- CITY 不是 DAY；日期由 CITY IANA 时区与 plannedStartAt 派生。",
    "- TRANSIT 是普通事件卡；路线补全只是该卡的后处理。",
    "- Link 只表示卡片顺序，不是卡片。",
    "",
    "[EXECUTION_STATE_MACHINE]",
    "严格执行 STAGE 01..10。每一阶段只允许进入 NEXT 列出的阶段。",
    "",
    "STAGE 01 LOAD_CONTEXT",
    "TOOL: periplus.workspace.get_context",
    "INPUT: {}",
    "SAVE: workspaceRevision, journeyId, hasJourney, cityCards",
    "BRANCH: hasJourney=false -> STAGE 03; hasJourney=true -> STAGE 02",
    "",
    "STAGE 02 READ_EXISTING_CHAIN",
    "TOOL: periplus.journey.project",
    "INPUT: 对 Root 和本次涉及的每个 City 分别传 scopeCityCardId",
    "SAVE: orderedCardsByScope",
    "RULE: 不允许根据原始 graph 自行排序",
    "NEXT: STAGE 03",
    "",
    "STAGE 03 BUILD_CARD_CHAIN",
    "TOOL: none",
    "SAVE: desiredCardChain",
    "REQUIRED: 每张新卡保存 cardId, type, scope, plannedStartAt, typeSpecificInputs",
    "RULE: 每个城市一张 CITY；每个明确地点一张地点卡；需要移动的相邻卡之间一张 TRANSIT；cardId 当前 Workspace 唯一；可执行卡 plannedStartAt 含 UTC offset",
    "BRANCH: 缺用户必须决定的信息 -> STAGE 10; 信息足够 -> STAGE 04",
    "",
    "STAGE 04 RESOLVE_EVIDENCE",
    "TOOLS: 可选 periplus.place.search；地点确认 periplus.place.resolve；可选图片 periplus.place.enrich；酒店推荐 periplus.hotel.search；仅 provider fallback 使用 WebSearch/web_search + periplus.place.fallback",
    "SAVE: placeResolutionIdByCardId, hotelSelectionIdByCardId",
    "BRANCH: resolved -> 保存 handle；ambiguous -> STAGE 10；not_found 且 fallbackAllowed=false -> STAGE 10；not_found 且 fallbackAllowed=true -> WebSearch 后调用 periplus.place.fallback；fallback_registered -> 保存 handle；图片 warning -> 继续；证据齐全 -> STAGE 05",
    "FALLBACK: 必须引用失败的 failedRequestId，并提供能支撑该地点的 WebSearch 来源、名称、城市与坐标；后端会把 evidence 标记为 UNVERIFIED；禁止猜测坐标或把 fallback 伪装成 provider 结果；来源不能支撑坐标时进入 STAGE 10。",
    "RULE: 酒店城市、入住日期、晚数、人数任一缺失时进入 STAGE 10，不调用 hotel.search",
    "",
    "STAGE 05 OPEN_DRAFT",
    "TOOL: periplus.draft.open",
    "INPUT: expectedWorkspaceRevision=workspaceRevision, 唯一 idempotencyKey",
    "SAVE: draftId, repairsUsed=0",
    "NEXT: STAGE 06",
    "",
    "STAGE 06 MATERIALIZE_CARD_CHAIN",
    "TOOLS: periplus.draft.add_city_card / periplus.draft.add_place_card / periplus.draft.add_hotel_stay_card / periplus.draft.add_place_stay_card / periplus.draft.add_transit_card；编辑时使用对应 update/move/remove 工具",
    "ORDER: A. 创建被引用的 CITY 与地点/STAY 卡；B. 用 fromCardId/toCardId 插入 TRANSIT 卡",
    "RULE: A/B 只是引用依赖顺序，TRANSIT 始终是同级卡；mutation 必须串行；普通线性链不得调用 connect_cards/disconnect_cards",
    "NEXT: STAGE 07",
    "",
    "STAGE 07 VALIDATE",
    "TOOL: periplus.draft.validate",
    "INPUT: draftId, 唯一 attemptId",
    "SAVE: validation, repairsUsed, repairsRemaining",
    "COUNT: 首次 validate 不计 repair；每组非 Transit 修复后的 validate 计 1；最多 5 次；prepare_transit 不计",
    "BRANCH: valid=true -> STAGE 09；非 Transit AGENT issue -> STAGE 08 REPAIR；仅 TRANSIT_ROUTE_NOT_READY -> STAGE 08 PREPARE_TRANSIT；USER issue 或 repairsRemaining=0 -> STAGE 10",
    "",
    "STAGE 08 REPAIR_OR_PREPARE",
    "REPAIR: 只调用 issue.allowedTools；每次 mutation 传 issueId；只修改 issue.cardIds/linkIds/scopeCityCardId；一组修复完成 -> STAGE 07",
    "PREPARE_TRANSIT: 调用 periplus.draft.prepare_transit(draftId, transitCardId, operationId)；不增加 repairsUsed；仍有未 READY Transit -> 重复 PREPARE_TRANSIT；出现非 Transit issue -> REPAIR；valid=true -> STAGE 09",
    "",
    "STAGE 09 COMMIT_AND_CONFIRM",
    "TOOL 1: periplus.draft.commit(draftId, 唯一 idempotencyKey)",
    "SAVE: newWorkspaceRevision",
    "TOOL 2: periplus.journey.validate_current(expectedWorkspaceRevision=newWorkspaceRevision)",
    "SUCCESS: validation.valid=true 且当前 workspaceRevision=newWorkspaceRevision",
    "OUTPUT: 只在 SUCCESS 时声明完成；否则报告结构化失败，不得声称完成",
    "",
    "STAGE 10 ASK_USER_OR_REPORT",
    "TOOL: none",
    "OUTPUT: 地点歧义询问城市或完整名称；酒店条件缺失询问缺失字段；不可自动修复说明 issue.message；禁止 commit 部分行程",
    "",
    "[CONVERSATION_HISTORY]",
    conversation.history || "（无）",
    "",
    "[LATEST_USER_REQUEST]",
    conversation.latest,
    "",
    "</PERIPLUS_AUTO_PROTOCOL>",
  ].join("\n")
}

function suggestPrompt(
  messages: AgentConversationMessage[],
  workspaceSnapshot: string
) {
  const conversation = splitConversation(messages)
  return [
    '<PERIPLUS_SUGGEST_PROTOCOL version="2">',
    "",
    "[ROLE]",
    "你是 Periplus 旅程建议 Agent。",
    "",
    "[DATA_MODEL]",
    "Root Scope 由 CITY 与跨城 TRANSIT 组成；City Scope 由地点卡和市内 TRANSIT 组成；日期由城市时区与 plannedStartAt 派生。",
    "",
    "[OUTPUT_SCHEMA]",
    "禁止调用工具或修改 Workspace。只输出一个 JSON 对象，不输出 Markdown 或解释。",
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
    "commands.command 必须符合 TargetCommandBody。",
    "",
    "[CONVERSATION_HISTORY]",
    conversation.history || "（无）",
    "",
    "[LATEST_USER_REQUEST]",
    conversation.latest,
    "",
    "[WORKSPACE_SNAPSHOT]",
    workspaceSnapshot,
    "",
    "</PERIPLUS_SUGGEST_PROTOCOL>",
  ].join("\n")
}

export function buildPrompt(
  messages: AgentConversationMessage[],
  mode: AgentMode = "auto",
  workspaceSnapshot = "{}"
) {
  return mode === "suggest"
    ? suggestPrompt(messages, workspaceSnapshot)
    : autoPrompt(messages)
}

export function promptVersion(mode: AgentMode) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: 2,
        mode,
        template: buildPrompt([], mode, "{}"),
      })
    )
    .digest("hex")
}

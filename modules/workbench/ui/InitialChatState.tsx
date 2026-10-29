"use client"

import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { selectWorkspaceJourney } from "@/modules/workspace/state/selectors"
import AIComposer from "./AIComposer"
import PresetPromptBubbles from "./PresetPromptBubbles"

export default function InitialChatState() {
  const journey = useWorkspaceStore(selectWorkspaceJourney)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="periplus-chat-scroll min-h-0 flex-1 overflow-y-auto px-5 pt-6">
        <p className="text-[13px] leading-6 text-walnut">
          {journey?.events.length
            ? "可以继续调整停留时间、交通方式或每天的行程。当前旅程仍可浏览。"
            : "写下想去的地方，开始规划这段旅程。"}
        </p>
        <div className="mt-6">
          <PresetPromptBubbles
            prompts={["优化跨城交通时间", "检查每天是否太赶", "加入历史类景点"]}
            stacked
          />
        </div>
      </div>
      <div className="shrink-0 px-5 pt-3 pb-4">
        <AIComposer />
      </div>
    </div>
  )
}

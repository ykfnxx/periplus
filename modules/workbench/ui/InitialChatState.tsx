"use client"

import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { selectWorkspaceJourneyView } from "@/modules/workspace/state/selectors"
import AIComposer from "./AIComposer"
import PresetPromptBubbles from "./PresetPromptBubbles"

export default function InitialChatState() {
  const graph = useWorkspaceStore(selectWorkspaceJourneyView)
  const hasJourneyEvents = useWorkspaceStore(
    (state) =>
      (state.workspaceDocument?.session.flatJourney.events.length ?? 0) > 0
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {graph && hasJourneyEvents ? (
        <div className="periplus-chat-scroll min-h-0 flex-1 overflow-y-auto px-5 pt-6">
          <p className="text-[13px] leading-6 text-walnut">
            我已按当前范围整理好行程。选择城市或地点后，地图会同步显示对应路线。
          </p>
          <p className="mt-7 text-[13px] leading-6 text-walnut">
            你可以继续调整停留时间、交通方式或每天的行程强度。
          </p>
          <p className="mt-8 mb-2.5 text-[11px] font-black text-teak">
            你还可以继续问
          </p>
          <PresetPromptBubbles
            prompts={["优化跨城交通时间", "检查每天是否太赶", "加入历史类景点"]}
            stacked
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1" />
      )}
      <div className="shrink-0 px-5 pt-3 pb-4">
        <AIComposer />
      </div>
    </div>
  )
}

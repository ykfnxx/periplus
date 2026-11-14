"use client"
import JourneyMembers from "./JourneyMembers"
import type { PreviewVariant } from "../workbench/fixtures.preview"
export default function JourneyMembersPreview({
  variant,
}: {
  variant: PreviewVariant
}) {
  return (
    <div className="journal-workbench mx-auto h-dvh max-w-xl pt-16">
      <JourneyMembers
        title="杭州三日游"
        owner
        members={[]}
        invitations={[]}
        created={null}
        loading={variant === "busy"}
        busy={false}
        nowMs={0}
        error={variant === "error" ? "同行者读取失败，请重试。" : null}
        onClose={() => {}}
        onLoad={async () => {}}
        onCreate={async () => undefined}
        onRevoke={async () => true}
      />
    </div>
  )
}

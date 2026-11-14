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
        members={
          variant === "empty"
            ? []
            : [
                {
                  user: { userId: "preview-owner", name: "小林", image: null },
                  role: "OWNER",
                  joinedAt: "2026-11-14T00:00:00Z",
                },
                {
                  user: { userId: "preview-member", name: "小周", image: null },
                  role: "MEMBER",
                  joinedAt: "2026-11-14T01:00:00Z",
                },
              ]
        }
        invitations={
          variant === "empty"
            ? []
            : [
                {
                  id: "preview-invitation",
                  expiresAt: "2026-11-21T00:00:00Z",
                  revokedAt: null,
                },
              ]
        }
        created={null}
        loading={variant === "busy"}
        busy={false}
        nowMs={Date.parse("2026-11-14T12:00:00Z")}
        error={variant === "error" ? "同行者读取失败，请重试。" : null}
        onClose={() => {}}
        onLoad={async () => {}}
        onCreate={async () => undefined}
        onRevoke={async () => true}
      />
    </div>
  )
}

"use client"
import { useState } from "react"
import GrantList from "./GrantList"
export default function GrantListPreview({ variant }: { variant: string }) {
  const [revokedAt, setRevoked] = useState<string | null>(null)
  return (
    <section className="mx-auto mt-24 max-w-xl p-6">
      <GrantList
        resource="https://example.test/api/mcp"
        now={Date.parse("2026-11-14")}
        busy={variant === "busy" ? "preview-grant" : null}
        error={variant === "error" ? "撤销失败，请重试。" : null}
        grants={
          variant === "empty"
            ? []
            : [
                {
                  id: "preview-grant",
                  clientName: "演示客户端",
                  userName: "预览作者",
                  scopes: ["journey:read", "journey:write"],
                  expiresAt: "2026-12-14T00:00:00Z",
                  lastUsedAt: null,
                  revokedAt,
                },
              ]
        }
        revoke={() => setRevoked("2026-11-14T00:00:00Z")}
      />
    </section>
  )
}

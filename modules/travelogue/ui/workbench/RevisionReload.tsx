"use client"

import { useStore } from "zustand"
import { Button } from "@/components/kumo/components/button/button"
import type { RecordingStore } from "../../state/recording-store"

export default function RevisionReload({
  store,
  onReload,
}: {
  store: RecordingStore
  onReload?: () => void
}) {
  const conflict = useStore(store, (state) => state.conflict)
  const loading = useStore(store, (state) => state.loading)
  if (!conflict) return null
  return (
    <div role="status" className="my-3 space-y-2 text-sm text-journal-muted">
      <p>同行者已更新记录。读取最新版本后再保存，当前输入会保留。</p>
      <Button
        variant="secondary"
        loading={loading}
        onClick={async () => {
          await store.getState().load()
          if (!store.getState().error) onReload?.()
        }}
      >
        读取最新记录
      </Button>
    </div>
  )
}

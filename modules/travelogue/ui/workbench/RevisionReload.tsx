"use client"
import { Button } from "@/components/kumo/components/button/button"
export default function RevisionReload({ conflict, loading, onReload }: { conflict: boolean; loading: boolean; onReload: () => Promise<void> }) {
  if (!conflict) return null
  return <div role="status" className="my-3 space-y-2 text-sm text-journal-muted"><p>同行者已更新记录。读取最新版本后再保存，当前输入会保留。</p><Button variant="secondary" loading={loading} onClick={onReload}>读取最新记录</Button></div>
}

"use client"
import { Button } from "@/components/kumo/components/button/button"
export default function DraftEntry({
  count,
  error,
  onOpen,
}: {
  count: number
  error: boolean
  onOpen: () => void
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      title={error ? "本机草稿准备失败，请打开检查" : "本机草稿箱"}
      onClick={onOpen}
    >
      草稿箱{count > 0 ? ` · ${count}` : ""}
      {error ? " !" : ""}
    </Button>
  )
}

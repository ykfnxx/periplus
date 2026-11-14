"use client"

import { useEffect, useState } from "react"
import { MapPin } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import type { JourneyEvent } from "@/modules/data-model/contracts/index"
import { useConfirmation } from "@/components/ui/Modal"
import LocationPanel from "../map/LocationPanel"

export default function PhotoLocationEditor({
  photo,
  entry,
  onSave,
  onDirty,
}: {
  photo: JourneyEvent["photos"][number]
  entry: JourneyEvent
  onSave: (location: JourneyEvent["location"]) => Promise<unknown>
  onDirty: (id: string, dirty: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { ask, confirmation } = useConfirmation()
  async function close() {
    if (dirty && !(await ask("照片位置尚未保存，放弃修改？"))) return
    setOpen(false)
    setDirty(false)
  }
  const key = `${photo.assetId}:location`
  useEffect(() => {
    onDirty(key, dirty)
    return () => onDirty(key, false)
  }, [key, dirty, onDirty])
  const location = photo.location ?? entry.location
  async function save(location: JourneyEvent["location"]) {
    setSaving(true)
    setError(null)
    try {
      await onSave(location)
      setDirty(false)
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "照片地点保存失败")
      throw cause
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 text-journal-muted">
          <MapPin size={14} className="shrink-0 text-journal-amber" />
          <span className="truncate">{location?.name || "未添加地点"}</span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {photo.location && !open && (
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => void save(null).catch(() => {})}
            >
              跟随记录
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => {
              if (open) void close()
              else setOpen(true)
            }}
          >
            {open ? "收起" : "位置"}
          </Button>
        </div>
      </div>
      {open && (
        <LocationPanel
          initialLocation={location}
          title="照片位置"
          removeLabel="改回跟随记录"
          onDirtyChange={setDirty}
          onClose={() => void close()}
          onSave={save}
        />
      )}
      {confirmation}
      {error && (
        <p role="alert" className="text-xs text-coral">
          {error}
        </p>
      )}
    </div>
  )
}

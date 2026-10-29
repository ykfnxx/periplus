"use client"
import { useEffect, useState } from "react"
import { MapPin } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import type { JourneyEvent } from "@/modules/data-model/contracts"
import type { RecordingStore } from "../../state/recording-store"
import { useConfirmation } from "./Modal"
import LocationPanel from "./LocationPanel"

export default function PhotoLocationEditor({
  photo,
  entry,
  store,
  onDirty,
}: {
  photo: JourneyEvent["photos"][number]
  entry: JourneyEvent
  store: RecordingStore
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
      await store.getState().mutate({
        name: "photo.update",
        eventId: entry.id,
        assetId: photo.assetId,
        patch: { location },
      })
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2 text-walnut">
          <MapPin size={16} className="shrink-0" />
          <span className="truncate">{location?.name || "尚未设置位置"}</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={() => {
            if (open) void close()
            else setOpen(true)
          }}
        >
          修改位置
        </Button>
      </div>
      <p className="text-xs text-walnut">
        {photo.location ? "这张照片的独立位置" : "跟随所属记录地点"}
      </p>
      {open && (
        <LocationPanel
          initialLocation={location}
          title="照片位置"
          description="为这张照片单独设置位置；补充坐标后会显示在地图上。"
          removeLabel="改回跟随记录"
          onDirtyChange={setDirty}
          onClose={() => void close()}
          onSave={save}
        />
      )}
      {photo.location && !open && (
        <Button
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={() => void save(null).catch(() => {})}
        >
          改回跟随记录
        </Button>
      )}
      {confirmation}
      {error && (
        <p role="alert" className="text-sm text-coral">
          {error}
        </p>
      )}
    </div>
  )
}

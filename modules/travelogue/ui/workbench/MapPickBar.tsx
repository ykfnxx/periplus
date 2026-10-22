"use client"
import { useEffect, useRef } from "react"
import { MapPin } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import type { RecordingLocation } from "@/modules/data-model/contracts/recording"

export default function MapPickBar({
  location,
  onChange,
  onCancel,
  onConfirm,
  onRemove,
}: {
  location: RecordingLocation | null
  onChange: (location: RecordingLocation | null) => void
  onCancel: () => void
  onRemove: () => void
  onConfirm: () => void
}) {
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancel.current?.focus({ preventScroll: true })
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        onCancel()
      }
    }
    window.addEventListener("keydown", escape)
    return () => window.removeEventListener("keydown", escape)
  }, [onCancel])
  return (
    <section
      aria-label="地图选点"
      className="absolute inset-x-0 top-0 z-30 border-b border-ink-10 bg-white px-5 py-4 shadow-periplus-soft md:px-8"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="min-w-0">
          <p role="status" className="text-base font-semibold">
            正在选点
          </p>
          <p className="mt-1 text-xs text-walnut">点击地图选择位置</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button ref={cancel} variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={!location?.coordinates}
            onClick={onConfirm}
          >
            使用此位置
          </Button>
        </div>
      </div>
      {location && (
        <div className="mx-auto mt-3 flex max-w-5xl items-center gap-2 border-t border-ink-10 pt-3 text-sm text-walnut">
          <MapPin size={16} className="shrink-0" />
          <input
            aria-label="地点名称"
            placeholder="所选位置"
            maxLength={300}
            value={location.name}
            onChange={(event) =>
              onChange({ ...location, name: event.target.value })
            }
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
          <Button variant="ghost" size="sm" onClick={onRemove}>
            移除地点
          </Button>
        </div>
      )}
    </section>
  )
}

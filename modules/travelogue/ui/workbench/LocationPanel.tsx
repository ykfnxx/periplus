"use client"
import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { MapPin } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { Input } from "@/components/kumo/components/input/input"
import type { RecordingEventContent } from "@/modules/data-model/contracts/recording"
import { recordingCoordinateToMap } from "../display"
const RecordMap = dynamic(() => import("../RecordMap"), { ssr: false })
type Location = NonNullable<RecordingEventContent["location"]>
export default function LocationPanel({
  initialLocation,
  onSave,
  onClose,
  onDirtyChange,
}: {
  initialLocation?: Location | null
  onSave: (location: Location | null) => Promise<void>
  onClose: () => void
  onDirtyChange?: (dirty: boolean) => void
}) {
  const coordinate = initialLocation?.coordinates
    ? recordingCoordinateToMap(initialLocation.coordinates)
    : null
  const [name, setName] = useState(initialLocation?.name || "")
  const [lat, setLat] = useState(coordinate?.lat.toString() || "")
  const [lng, setLng] = useState(coordinate?.lng.toString() || "")
  const [showMap, setShowMap] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty =
    name !== (initialLocation?.name || "") ||
    lat !== (coordinate?.lat.toString() || "") ||
    lng !== (coordinate?.lng.toString() || "")
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])
  const validCoordinates =
    lat !== "" &&
    lng !== "" &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng)) &&
    Math.abs(Number(lat)) <= 90 &&
    Math.abs(Number(lng)) <= 180
  const points = useMemo(
    () =>
      validCoordinates
        ? [
            {
              eventId: "picked",
              title: name || "所选位置",
              lat: Number(lat),
              lng: Number(lng),
            },
          ]
        : [],
    [validCoordinates, name, lat, lng]
  )
  async function save(remove = false) {
    if (!remove && !name.trim()) {
      setError("请填写地点名称。")
      return
    }
    if (!remove && (lat || lng) && !validCoordinates) {
      setError("经纬度需要一起填写，并处于有效范围内。")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(
        remove
          ? null
          : {
              name: name.trim(),
              address: initialLocation?.address || null,
              coordinates: validCoordinates
                ? {
                    lat: Number(lat),
                    lng: Number(lng),
                    coordinateSystem: "GCJ02",
                  }
                : null,
            }
      )
      onDirtyChange?.(false)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "地点保存失败，请重试。"
      )
      setSaving(false)
    }
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
      className="space-y-4"
    >
      <h3 className="text-xl font-black">记录地点</h3>
      <Input
        label="地点名称"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="例如：西湖边的一家茶馆"
      />
      <p className="text-sm leading-6 text-walnut">
        可以先记下名称。补充坐标后，这段经历会显示在旅程地图上。
      </p>
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => setShowMap(!showMap)}
      >
        <MapPin size={17} />
        {showMap ? "收起地图" : "在地图上选点"}
      </Button>
      {showMap && (
        <div className="h-64">
          <RecordMap
            points={points}
            onPick={(coordinate) => {
              setLat(coordinate.lat.toFixed(6))
              setLng(coordinate.lng.toFixed(6))
            }}
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="纬度"
          type="number"
          min={-90}
          max={90}
          step="any"
          value={lat}
          onChange={(event) => setLat(event.target.value)}
        />
        <Input
          label="经度"
          type="number"
          min={-180}
          max={180}
          step="any"
          value={lng}
          onChange={(event) => setLng(event.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-coral">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {initialLocation && (
          <Button
            variant="secondary-destructive"
            disabled={saving}
            onClick={() => void save(true)}
          >
            移除地点
          </Button>
        )}
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          取消
        </Button>
        <Button variant="primary" type="submit" loading={saving}>
          保存地点
        </Button>
      </div>
    </form>
  )
}

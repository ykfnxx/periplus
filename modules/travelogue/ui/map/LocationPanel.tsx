"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { MapPin } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { Input } from "@/components/kumo/components/input/input"
import type { EventContent } from "@/modules/data-model/contracts/index"
import { recordingCoordinateToMap } from "../formatting/display"

const RecordMap = dynamic(() => import("./RecordMap"), { ssr: false })
type Location = NonNullable<EventContent["location"]>

export default function LocationPanel({
  initialLocation,
  onSave,
  onClose,
  onDirtyChange,
  title = "记录地点",
  removeLabel = "移除地点",
}: {
  title?: string
  description?: string
  removeLabel?: string
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
                    coordinateSystem: "WGS84",
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
      className="space-y-3 rounded-2xl border border-journal-line bg-journal-paper-soft p-3.5"
    >
      <h4 className="text-sm font-semibold text-journal-ink">{title}</h4>
      <Input
        label="地点名称"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="例如：西湖边的一家茶馆"
      />
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => setShowMap(!showMap)}
      >
        <MapPin size={16} />
        {showMap ? "收起地图" : "在地图上选点"}
      </Button>
      {showMap && (
        <div className="h-52 overflow-hidden rounded-xl border border-journal-line">
          <RecordMap
            points={points}
            onPick={(coordinate) => {
              setLat(coordinate.lat.toFixed(6))
              setLng(coordinate.lng.toFixed(6))
            }}
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5">
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
            size="sm"
            disabled={saving}
            onClick={() => void save(true)}
          >
            {removeLabel}
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={onClose}
          disabled={saving}
        >
          取消
        </Button>
        <Button variant="primary" size="sm" type="submit" loading={saving}>
          保存地点
        </Button>
      </div>
    </form>
  )
}

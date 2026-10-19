"use client"

import type { RecordingEventContent } from "@/modules/data-model/contracts/recording"
import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { MapPin } from "lucide-react"
import RecordDialog from "./RecordDialog"
import { recordingCoordinateToMap } from "./display"
import {
  RecordButton,
  RecordError,
  RecordField,
  recordInputClass,
} from "./primitives"

const RecordMap = dynamic(() => import("./RecordMap"), { ssr: false })

export type RecordLocationInput = NonNullable<RecordingEventContent["location"]>

export default function RecordLocationForm({
  initialLocation,
  onSave,
  onClose,
}: {
  initialLocation?: RecordLocationInput | null
  onSave: (location: RecordLocationInput | null) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(initialLocation?.name || "")
  const coordinate = initialLocation?.coordinates
    ? recordingCoordinateToMap(initialLocation.coordinates)
    : null
  const [lat, setLat] = useState(coordinate?.lat.toString() || "")
  const [lng, setLng] = useState(coordinate?.lng.toString() || "")
  const [showMap, setShowMap] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasCoordinates =
    lat !== "" &&
    lng !== "" &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng))
  const points = useMemo(
    () =>
      hasCoordinates
        ? [
            {
              eventId: "picked",
              title: name || "所选位置",
              lat: Number(lat),
              lng: Number(lng),
            },
          ]
        : [],
    [hasCoordinates, lat, lng, name]
  )

  async function save(remove = false) {
    setError(null)
    if (!remove && !name.trim()) {
      setError("请填写地点名称。")
      return
    }
    if (
      !remove &&
      ((lat === "") !== (lng === "") ||
        (lat !== "" &&
          (!hasCoordinates ||
            Math.abs(Number(lat)) > 90 ||
            Math.abs(Number(lng)) > 180)))
    ) {
      setError("经纬度需要一起填写，并处于有效范围内。")
      return
    }
    setSaving(true)
    try {
      await onSave(
        remove
          ? null
          : {
              name: name.trim(),
              address: initialLocation?.address || null,
              coordinates: hasCoordinates
                ? {
                    lat: Number(lat),
                    lng: Number(lng),
                    coordinateSystem: "GCJ02",
                  }
                : null,
            }
      )
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "地点保存失败，请重试。"
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <RecordDialog
      title="记录地点"
      onClose={() => {
        if (!saving) onClose()
      }}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <RecordField label="地点名称">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：西湖边的一家茶馆"
            className={recordInputClass}
          />
        </RecordField>
        <p className="text-sm leading-6 text-walnut">
          可以先记下名称。补充坐标后，这段经历会显示在旅程地图上。
        </p>
        <RecordButton onClick={() => setShowMap(!showMap)} className="w-full">
          <MapPin size={17} />
          {showMap ? "收起地图" : "在地图上选点"}
        </RecordButton>
        {showMap ? (
          <div className="h-72">
            <RecordMap
              points={points}
              onPick={(coordinate) => {
                setLat(coordinate.lat.toFixed(6))
                setLng(coordinate.lng.toFixed(6))
              }}
            />
          </div>
        ) : null}
        <details className="rounded-xl border border-ink-10 p-3">
          <summary className="cursor-pointer text-sm font-bold text-walnut">
            填写或调整坐标
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <RecordField label="纬度">
              <input
                aria-label="纬度"
                type="number"
                min="-90"
                max="90"
                step="any"
                value={lat}
                onChange={(event) => setLat(event.target.value)}
                className={recordInputClass}
              />
            </RecordField>
            <RecordField label="经度">
              <input
                aria-label="经度"
                type="number"
                min="-180"
                max="180"
                step="any"
                value={lng}
                onChange={(event) => setLng(event.target.value)}
                className={recordInputClass}
              />
            </RecordField>
          </div>
        </details>
        {hasCoordinates ? (
          <p className="text-xs text-walnut">
            已选位置：{lat}，{lng}
          </p>
        ) : null}
        <RecordError message={error} />
        <div className="flex flex-wrap justify-end gap-2">
          {initialLocation ? (
            <RecordButton
              disabled={saving}
              onClick={() => void save(true)}
              className="mr-auto text-coral"
            >
              移除地点
            </RecordButton>
          ) : null}
          <RecordButton disabled={saving} onClick={onClose}>
            取消
          </RecordButton>
          <RecordButton primary type="submit" disabled={saving}>
            {saving ? "保存中…" : "保存地点"}
          </RecordButton>
        </div>
      </form>
    </RecordDialog>
  )
}

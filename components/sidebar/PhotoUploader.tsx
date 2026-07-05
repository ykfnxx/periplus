"use client"

import { useRef, useCallback, useState } from "react"
import { useMapStore } from "@/stores/mapStore"
import { parseExifGps, wgs84ToGcj02, readFileAsDataURL } from "@/lib/exif"
import { photoDtoToShare, uploadPhoto } from "@/lib/photos/client"

export default function PhotoUploader() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [validationError, setValidationError] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const addPhotoShare = useMapStore((s) => s.addPhotoShare)
  const startPhotoLocationSelection = useMapStore(
    (s) => s.startPhotoLocationSelection
  )
  const clearLocationSelection = useMapStore((s) => s.clearLocationSelection)
  const isSelectingLocation = useMapStore((s) => s.isSelectingLocation)
  const locationSelectionMode = useMapStore((s) => s.locationSelectionMode)
  const isSelectingPhotoLocation =
    isSelectingLocation && locationSelectionMode === "photo"

  const clearInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.value = ""
    }
  }, [])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      setValidationError("")

      if (!file.type.startsWith("image/")) {
        setValidationError("请选择图片文件")
        clearInput()
        return
      }

      if (file.size > 5 * 1024 * 1024) {
        setValidationError("图片大小不能超过 5MB")
        clearInput()
        return
      }

      setIsUploading(true)

      try {
        const imageDataUrl = await readFileAsDataURL(file)
        const gps = await parseExifGps(file)

        if (gps) {
          // 高德地图使用 GCJ-02，照片 EXIF 坐标需要从 WGS-84 转换后再落点
          const [gcjLng, gcjLat] = wgs84ToGcj02(gps.lng, gps.lat)
          const photo = await uploadPhoto({
            file,
            lat: gcjLat,
            lng: gcjLng,
          })
          addPhotoShare(photoDtoToShare(photo))
        } else {
          startPhotoLocationSelection(file, imageDataUrl)
        }
      } catch (error) {
        setValidationError(
          error instanceof Error ? error.message : "图片上传失败"
        )
      } finally {
        setIsUploading(false)
      }

      clearInput()
    },
    [addPhotoShare, clearInput, startPhotoLocationSelection]
  )

  const handleCancelSelection = useCallback(() => {
    setValidationError("")
    clearLocationSelection()
  }, [clearLocationSelection])

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      {isSelectingPhotoLocation ? (
        <div className="space-y-2">
          <p className="text-xs font-bold text-[var(--periplus-russet)]">
            照片没有 GPS 信息，请在地图上点击选择位置
          </p>
          <button
            type="button"
            onClick={handleCancelSelection}
            className="h-9 w-full rounded-full border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-cream)] px-4 text-xs font-black text-[var(--periplus-walnut)] transition hover:border-[var(--periplus-russet)]"
          >
            取消选点
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="h-9 w-full rounded-full bg-[var(--periplus-russet)] px-4 text-xs font-black text-[var(--periplus-soft-white)] transition hover:bg-[var(--periplus-ink)]"
        >
          {isUploading ? "上传中..." : "添加照片素材"}
        </button>
      )}
      {validationError && (
        <p className="text-xs leading-5 font-bold text-[var(--periplus-coral)]">
          {validationError}
        </p>
      )}
    </div>
  )
}

"use client"

import { useRef, useCallback, useState } from "react"
import { useMapStore } from "@/stores/mapStore"
import type { UploadPhoto } from "@/stores/mapStore"
import { parseExifGps, wgs84ToGcj02, readFileAsDataURL } from "@/lib/exif"
import { photoDtoToShare, uploadPhoto } from "@/lib/photos/client"

function generatePhotoId(): string {
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function PhotoUploadModal() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [validationError, setValidationError] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const uploadModalOpen = useMapStore((s) => s.uploadModalOpen)
  const setUploadModalOpen = useMapStore((s) => s.setUploadModalOpen)
  const uploadStep = useMapStore((s) => s.uploadStep)
  const setUploadStep = useMapStore((s) => s.setUploadStep)
  const uploadPhotos = useMapStore((s) => s.uploadPhotos)
  const setUploadPhotos = useMapStore((s) => s.setUploadPhotos)
  const addUploadPhoto = useMapStore((s) => s.addUploadPhoto)
  const updateUploadPhoto = useMapStore((s) => s.updateUploadPhoto)
  const clearUploadState = useMapStore((s) => s.clearUploadState)
  const addPhotoShare = useMapStore((s) => s.addPhotoShare)
  const map = useMapStore((s) => s.map)

  const clearInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.value = ""
    }
  }, [])

  const processFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return

      setValidationError("")

      const validFiles = files.filter((file) => {
        if (!file.type.startsWith("image/")) {
          setValidationError("请选择图片文件")
          return false
        }
        if (file.size > 5 * 1024 * 1024) {
          setValidationError("图片大小不能超过 5MB")
          return false
        }
        return true
      })

      if (validFiles.length === 0) {
        clearInput()
        return
      }

      setValidationError("")

      for (const file of validFiles) {
        try {
          const previewUrl = await readFileAsDataURL(file)
          const gps = await parseExifGps(file)

          const photo: UploadPhoto = {
            id: generatePhotoId(),
            file,
            previewUrl,
            hasGPS: Boolean(gps),
          }

          if (gps) {
            const [gcjLng, gcjLat] = wgs84ToGcj02(gps.lng, gps.lat)
            photo.lat = gcjLat
            photo.lng = gcjLng
          }

          addUploadPhoto(photo)
        } catch {
          setValidationError(`读取 ${file.name} 失败`)
        }
      }

      clearInput()
    },
    [addUploadPhoto, clearInput]
  )

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      await processFiles(files)
    },
    [processFiles]
  )

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files)
      await processFiles(files)
    },
    [processFiles]
  )

  const handleRemovePhoto = useCallback(
    (id: string) => {
      setUploadPhotos(uploadPhotos.filter((p) => p.id !== id))
    },
    [uploadPhotos, setUploadPhotos]
  )

  const handleNextStep = useCallback(() => {
    if (uploadStep === 1) {
      const needsLocation = uploadPhotos.some((p) => !p.hasGPS && (!p.lat || !p.lng))
      if (needsLocation) {
        setUploadStep(2)
      } else {
        setUploadStep(3)
      }
    } else if (uploadStep === 2) {
      setUploadStep(3)
    }
  }, [uploadStep, uploadPhotos, setUploadStep])

  const handlePrevStep = useCallback(() => {
    if (uploadStep === 3) {
      const needsLocation = uploadPhotos.some((p) => !p.hasGPS && (!p.lat || !p.lng))
      if (needsLocation) {
        setUploadStep(2)
      } else {
        setUploadStep(1)
      }
    } else if (uploadStep === 2) {
      setUploadStep(1)
    }
  }, [uploadStep, uploadPhotos, setUploadStep])

  const handleMapClickForPhoto = useCallback(
    (photoId: string) => {
      if (!map) return
      const clickHandler = (e: AMap.MapsEvent<'click', AMap.Map>) => {
        const lnglat = e.lnglat
        updateUploadPhoto(photoId, { lat: lnglat.getLat(), lng: lnglat.getLng() })
        map.off("click", clickHandler)
      }
      map.on("click", clickHandler)
    },
    [map, updateUploadPhoto]
  )

  const handleSubmit = useCallback(async () => {
    setIsUploading(true)
    setValidationError("")

    try {
      for (const photo of uploadPhotos) {
        if (photo.lat === undefined || photo.lng === undefined) {
          continue
        }
        const uploaded = await uploadPhoto({
          file: photo.file,
          lat: photo.lat,
          lng: photo.lng,
          caption: photo.caption ?? "",
        })
        addPhotoShare(photoDtoToShare(uploaded))
      }
      clearUploadState()
    } catch (error) {
      setValidationError(
        error instanceof Error ? error.message : "上传失败"
      )
    } finally {
      setIsUploading(false)
    }
  }, [uploadPhotos, addPhotoShare, clearUploadState])

  const handleClose = useCallback(() => {
    clearUploadState()
  }, [clearUploadState])

  if (!uploadModalOpen) return null

  const photosWithoutGPS = uploadPhotos.filter((p) => !p.hasGPS && (!p.lat || !p.lng))

  const dropAreaBorder = isDragging
    ? "border-[var(--periplus-russet)] bg-[var(--periplus-cream)]"
    : "border-[rgb(44_36_22_/_14%)] bg-transparent"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(44_36_22_/_60%)]">
      <div className="w-full max-w-[560px] rounded-2xl bg-[var(--periplus-soft-white)] p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-black text-[var(--periplus-ink)]">
            {uploadStep === 1 && "选择照片"}
            {uploadStep === 2 && "标记位置"}
            {uploadStep === 3 && "添加描述"}
          </h2>
        </div>

        {uploadStep === 1 && (
          <div className="space-y-4">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <div
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-colors ${dropAreaBorder}`}
            >
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="h-9 rounded-full bg-[var(--periplus-russet)] px-4 text-xs font-black text-[var(--periplus-soft-white)] transition hover:bg-[var(--periplus-ink)]"
              >
                选择照片
              </button>
              <p className="mt-2 text-xs text-[var(--periplus-walnut)]">或拖拽照片到此处</p>
            </div>

            {uploadPhotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {uploadPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    className={`relative ${!photo.hasGPS && (!photo.lat || !photo.lng) ? "border border-[var(--periplus-coral)]" : ""}`}
                  >
                    <img
                      src={photo.previewUrl}
                      alt="preview"
                      className="h-24 w-full rounded object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(photo.id)}
                      className="absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--periplus-coral)] text-[10px] font-bold text-[var(--periplus-soft-white)]"
                    >
                      x
                    </button>
                    {photo.hasGPS && (
                      <span className="absolute bottom-0 left-0 rounded bg-[var(--periplus-olive)] px-1 text-[10px] font-bold text-[var(--periplus-soft-white)]">
                        GPS
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="h-9 flex-1 rounded-full border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-cream)] px-6 py-2 text-sm text-[var(--periplus-walnut)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleNextStep}
                className="h-9 flex-1 rounded-full bg-[var(--periplus-russet)] px-4 text-xs font-black text-[var(--periplus-soft-white)] transition hover:bg-[var(--periplus-ink)]"
              >
                下一步
              </button>
            </div>
          </div>
        )}

        {uploadStep === 2 && (
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="flex h-64 items-center justify-center rounded-xl border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-cream)]">
                <span className="text-xs text-[var(--periplus-walnut)]">地图区域</span>
              </div>
            </div>
            <div className="w-48 space-y-4">
              <p className="text-xs font-bold text-[var(--periplus-russet)]">
                以下照片缺少 GPS 信息，请在地图上点击选择位置
              </p>
              <div className="grid grid-cols-2 gap-2">
                {photosWithoutGPS.map((photo) => (
                  <div key={photo.id} className="relative">
                    <img
                      src={photo.previewUrl}
                      alt="preview"
                      className="h-24 w-full rounded object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleMapClickForPhoto(photo.id)}
                      className="absolute bottom-0 left-0 rounded bg-[var(--periplus-russet)] px-1 text-[10px] font-bold text-[var(--periplus-soft-white)]"
                    >
                      点击选点
                    </button>
                    {photo.lat !== undefined && photo.lng !== undefined && (
                      <span className="absolute bottom-0 right-0 rounded bg-[var(--periplus-olive)] px-1 text-[10px] font-bold text-[var(--periplus-soft-white)]">
                        已标记
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="h-9 flex-1 rounded-full border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-cream)] px-6 py-2 text-sm text-[var(--periplus-walnut)]"
                >
                  上一步
                </button>
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="h-9 flex-1 rounded-full bg-[var(--periplus-russet)] px-4 text-xs font-black text-[var(--periplus-soft-white)] transition hover:bg-[var(--periplus-ink)]"
                >
                  下一步
                </button>
              </div>
            </div>
          </div>
        )}

        {uploadStep === 3 && (
          <div className="space-y-4">
            <div className="max-h-64 space-y-3 overflow-y-auto">
              {uploadPhotos.map((photo) => (
                <div key={photo.id} className="flex gap-3">
                  <img
                    src={photo.previewUrl}
                    alt="preview"
                    className="h-16 w-16 shrink-0 rounded object-cover"
                  />
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="添加描述..."
                      value={photo.caption ?? ""}
                      onChange={(e) =>
                        updateUploadPhoto(photo.id, { caption: e.target.value })
                      }
                      className="w-full rounded border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-cream)] px-3 py-2 text-xs text-[var(--periplus-ink)] placeholder:text-[var(--periplus-walnut)]/50"
                    />
                    {photo.lat !== undefined && photo.lng !== undefined && (
                      <p className="mt-1 text-[10px] text-[var(--periplus-walnut)]">
                        位置: {photo.lat.toFixed(4)}, {photo.lng.toFixed(4)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="h-9 flex-1 rounded-full border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-cream)] px-6 py-2 text-sm text-[var(--periplus-walnut)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isUploading}
                className="h-9 flex-1 rounded-full bg-[var(--periplus-russet)] px-4 text-xs font-black text-[var(--periplus-soft-white)] transition hover:bg-[var(--periplus-ink)] disabled:opacity-50"
              >
                {isUploading ? "上传中..." : `上传 ${uploadPhotos.length} 张照片`}
              </button>
            </div>
          </div>
        )}

        {validationError && (
          <p className="mt-3 text-xs leading-5 font-bold text-[var(--periplus-coral)]">
            {validationError}
          </p>
        )}
      </div>
    </div>
  )
}

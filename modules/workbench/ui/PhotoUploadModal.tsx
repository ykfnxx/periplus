"use client"

import type { ChangeEvent, DragEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Check, ImagePlus, MapPin, Trash2, UploadCloud, X } from "lucide-react"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type { UploadPhoto } from "@/modules/workspace/state/types"
import { parseExifGps, readFileAsDataURL, wgs84ToGcj02 } from "@/lib/exif"
import { photoDtoToShare, uploadPhoto } from "@/modules/data/photos/client"

function generatePhotoId(): string {
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function hasCoordinates(photo: UploadPhoto) {
  return typeof photo.lat === "number" && typeof photo.lng === "number"
}

function formatCoordinates(photo: UploadPhoto) {
  if (!hasCoordinates(photo)) return ""
  return `${photo.lat!.toFixed(4)}, ${photo.lng!.toFixed(4)}`
}

export default function PhotoUploadModal() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null)
  const [validationError, setValidationError] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const mapReady = useWorkspaceStore((s) => s.mapReady)
  const uploadModalOpen = useWorkspaceStore((s) => s.uploadModalOpen)
  const uploadPhotos = useWorkspaceStore((s) => s.uploadPhotos)
  const setUploadPhotos = useWorkspaceStore((s) => s.setUploadPhotos)
  const addUploadPhoto = useWorkspaceStore((s) => s.addUploadPhoto)
  const updateUploadPhoto = useWorkspaceStore((s) => s.updateUploadPhoto)
  const startUploadPhotoLocationSelection = useWorkspaceStore(
    (s) => s.startUploadPhotoLocationSelection
  )
  const clearUploadState = useWorkspaceStore((s) => s.clearUploadState)
  const clearLocationSelection = useWorkspaceStore(
    (s) => s.clearLocationSelection
  )
  const addPhotoShare = useWorkspaceStore((s) => s.addPhotoShare)

  const activePhoto = useMemo(
    () =>
      uploadPhotos.find((photo) => photo.id === activePhotoId) ??
      uploadPhotos[0] ??
      null,
    [activePhotoId, uploadPhotos]
  )
  const missingLocationPhotos = uploadPhotos.filter(
    (photo) => !hasCoordinates(photo)
  )
  const canSubmit =
    uploadPhotos.length > 0 &&
    missingLocationPhotos.length === 0 &&
    !isUploading

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

      let firstPhotoId: string | null = null

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
            // 高德地图使用 GCJ-02，照片 EXIF 坐标需要从 WGS-84 转换后再落点
            const [gcjLng, gcjLat] = wgs84ToGcj02(gps.lng, gps.lat)
            photo.lat = gcjLat
            photo.lng = gcjLng
          }

          firstPhotoId ??= photo.id
          addUploadPhoto(photo)
        } catch {
          setValidationError(`读取 ${file.name} 失败`)
        }
      }

      if (firstPhotoId) setActivePhotoId(firstPhotoId)
      clearInput()
    },
    [addUploadPhoto, clearInput]
  )

  const handleFileSelect = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      await processFiles(Array.from(event.target.files ?? []))
    },
    [processFiles]
  )

  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setIsDragging(false)
      await processFiles(Array.from(event.dataTransfer.files))
    },
    [processFiles]
  )

  const handleRemovePhoto = useCallback(
    (photoId: string) => {
      setUploadPhotos((photos) =>
        photos.filter((photo) => photo.id !== photoId)
      )
    },
    [setUploadPhotos]
  )

  const handlePickLocation = useCallback(
    (photoId: string) => {
      if (!mapReady) {
        setValidationError("地图还在加载，请稍后再试")
        return
      }

      setValidationError("")
      setActivePhotoId(photoId)
      startUploadPhotoLocationSelection(photoId)
    },
    [mapReady, startUploadPhotoLocationSelection]
  )

  const handleSubmit = useCallback(async () => {
    const photosWithoutCoords = uploadPhotos.filter(
      (photo) => !hasCoordinates(photo)
    )

    if (photosWithoutCoords.length > 0) {
      setActivePhotoId(photosWithoutCoords[0]?.id ?? null)
      setValidationError(`${photosWithoutCoords.length} 张照片缺少坐标`)
      return
    }

    setIsUploading(true)
    setValidationError("")

    try {
      for (const photo of uploadPhotos) {
        const uploaded = await uploadPhoto({
          file: photo.file,
          lat: photo.lat!,
          lng: photo.lng!,
          caption: photo.caption?.trim() ?? "",
        })
        addPhotoShare(photoDtoToShare(uploaded))
      }
      clearUploadState()
      setActivePhotoId(null)
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "上传失败")
    } finally {
      setIsUploading(false)
    }
  }, [uploadPhotos, addPhotoShare, clearUploadState])

  const handleClose = useCallback(() => {
    clearLocationSelection()
    clearUploadState()
    setActivePhotoId(null)
    setValidationError("")
  }, [clearLocationSelection, clearUploadState])

  useEffect(() => {
    if (!uploadModalOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isUploading) {
        handleClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleClose, isUploading, uploadModalOpen])

  if (!uploadModalOpen) return null

  const previewAreaState = activePhoto
    ? "bg-[#111] text-white"
    : isDragging
      ? "bg-[var(--color-cream)] text-[var(--color-ink)]"
      : "bg-[var(--color-soft-white)] text-[var(--color-ink)]"

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-upload-title"
        className="flex max-h-[calc(100vh-40px)] w-[min(980px,calc(100vw-32px))] flex-col overflow-hidden rounded-[18px] bg-[var(--color-white)] text-[var(--color-ink)] shadow-[0_24px_70px_rgb(0_0_0_/_34%)]"
      >
        <header className="grid h-12 shrink-0 grid-cols-[48px_1fr_120px] items-center border-b border-[rgb(44_36_22_/_12%)] px-1">
          <button
            type="button"
            onClick={handleClose}
            disabled={isUploading}
            aria-label="关闭上传弹窗"
            title="关闭"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-walnut)] transition hover:bg-[rgb(44_36_22_/_7%)] hover:text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-russet)] disabled:opacity-50"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
          <h2
            id="photo-upload-title"
            className="text-center text-sm font-black text-[var(--color-ink)]"
          >
            创建照片素材
          </h2>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="justify-self-end rounded-full px-4 py-2 text-sm font-black text-[var(--color-russet)] transition hover:bg-[rgb(217_118_66_/_10%)] hover:text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-russet)] disabled:cursor-not-allowed disabled:text-[var(--color-teak)] disabled:opacity-50"
          >
            {isUploading ? "上传中" : "上传"}
          </button>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`relative flex min-h-[420px] min-w-0 flex-col transition-colors lg:min-h-[620px] ${previewAreaState}`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

            {activePhoto ? (
              <>
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  <img
                    src={activePhoto.previewUrl}
                    alt={activePhoto.file.name || "照片预览"}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-t border-white/10 bg-black/55 p-3">
                  {uploadPhotos.map((photo) => {
                    const isActive = photo.id === activePhoto.id
                    return (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => setActivePhotoId(photo.id)}
                        className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-md border transition ${
                          isActive
                            ? "border-[var(--color-russet)]"
                            : "border-white/25 opacity-70 hover:opacity-100"
                        }`}
                        aria-label={`选择 ${photo.file.name}`}
                      >
                        <img
                          src={photo.previewUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        {hasCoordinates(photo) && (
                          <span className="absolute right-1 bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-olive)] text-white">
                            <Check aria-hidden="true" className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-white/35 text-white/80 transition hover:border-white hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    aria-label="添加更多照片"
                    title="添加更多照片"
                  >
                    <ImagePlus aria-hidden="true" className="h-5 w-5" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <div
                  className={`flex h-24 w-24 items-center justify-center rounded-full border border-dashed ${
                    isDragging
                      ? "border-[var(--color-russet)] bg-[rgb(217_118_66_/_10%)] text-[var(--color-russet)]"
                      : "border-[rgb(44_36_22_/_18%)] bg-[var(--color-white)] text-[var(--color-teak)]"
                  }`}
                >
                  <UploadCloud aria-hidden="true" className="h-10 w-10" />
                </div>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-6 rounded-full bg-[var(--color-russet)] px-5 py-2.5 text-sm font-black text-[var(--color-soft-white)] transition hover:bg-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-russet)]"
                >
                  选择照片
                </button>
                <p className="mt-3 text-xs font-bold text-[var(--color-teak)]">
                  或拖拽图片到这里
                </p>
              </div>
            )}
          </section>

          <aside className="flex min-h-0 flex-col border-t border-[rgb(44_36_22_/_12%)] bg-[var(--color-white)] lg:border-t-0 lg:border-l">
            <div className="flex items-center gap-3 border-b border-[rgb(44_36_22_/_10%)] p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-cream)] text-[var(--color-russet)]">
                <ImagePlus aria-hidden="true" className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[var(--color-ink)]">
                  照片素材
                </p>
                <p className="text-xs font-bold text-[var(--color-teak)]">
                  {uploadPhotos.length > 0
                    ? `${uploadPhotos.length} 张待上传`
                    : "还没有选择照片"}
                </p>
              </div>
            </div>

            <div className="periplus-chat-scroll min-h-0 flex-1 overflow-y-auto p-4">
              {activePhoto ? (
                <div className="space-y-5">
                  <textarea
                    value={activePhoto.caption ?? ""}
                    onChange={(event) =>
                      updateUploadPhoto(activePhoto.id, {
                        caption: event.target.value,
                      })
                    }
                    placeholder="添加描述..."
                    className="h-28 w-full resize-none rounded-[10px] border border-[rgb(44_36_22_/_14%)] bg-[var(--color-soft-white)] px-3 py-3 text-sm leading-5 text-[var(--color-ink)] transition outline-none placeholder:text-[var(--color-teak)]/70 focus:border-[var(--color-russet)]"
                  />

                  <div className="rounded-[12px] border border-[rgb(44_36_22_/_12%)] bg-[var(--color-soft-white)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-xs font-black text-[var(--color-ink)]">
                          <MapPin
                            aria-hidden="true"
                            className="h-3.5 w-3.5 text-[var(--color-russet)]"
                          />
                          坐标
                        </p>
                        <p className="mt-1 text-xs leading-5 font-bold text-[var(--color-teak)]">
                          {hasCoordinates(activePhoto)
                            ? formatCoordinates(activePhoto)
                            : "尚未标记"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePickLocation(activePhoto.id)}
                        className="shrink-0 rounded-full border border-[rgb(44_36_22_/_12%)] bg-[var(--color-white)] px-3 py-1.5 text-xs font-black text-[var(--color-russet)] transition hover:border-[var(--color-russet)] hover:bg-[rgb(217_118_66_/_8%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-russet)]"
                      >
                        {hasCoordinates(activePhoto) ? "重新选择" : "选择坐标"}
                      </button>
                    </div>
                    {activePhoto.hasGPS && hasCoordinates(activePhoto) && (
                      <p className="mt-3 border-t border-[rgb(44_36_22_/_10%)] pt-2 text-[11px] font-bold text-[var(--color-olive)]">
                        已读取照片 GPS
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-black text-[var(--color-ink)]">
                        照片队列
                      </p>
                      {missingLocationPhotos.length > 0 && (
                        <p className="text-xs font-black text-[var(--color-coral)]">
                          待补坐标 {missingLocationPhotos.length}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      {uploadPhotos.map((photo) => {
                        const isActive = photo.id === activePhoto.id
                        return (
                          <div
                            key={photo.id}
                            className={`flex items-center gap-2 rounded-[10px] border p-2 transition ${
                              isActive
                                ? "border-[var(--color-russet)] bg-[rgb(217_118_66_/_7%)]"
                                : "border-[rgb(44_36_22_/_10%)] bg-[var(--color-white)]"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setActivePhotoId(photo.id)}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              <img
                                src={photo.previewUrl}
                                alt=""
                                className="h-10 w-10 shrink-0 rounded-md object-cover"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-black text-[var(--color-ink)]">
                                  {photo.file.name}
                                </span>
                                <span
                                  className={`mt-0.5 block text-[11px] font-bold ${
                                    hasCoordinates(photo)
                                      ? "text-[var(--color-olive)]"
                                      : "text-[var(--color-coral)]"
                                  }`}
                                >
                                  {hasCoordinates(photo)
                                    ? "已标记"
                                    : "缺少坐标"}
                                </span>
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(photo.id)}
                              aria-label={`移除 ${photo.file.name}`}
                              title="移除"
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-teak)] transition hover:bg-[rgb(44_36_22_/_7%)] hover:text-[var(--color-coral)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-russet)]"
                            >
                              <Trash2 aria-hidden="true" className="h-4 w-4" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center rounded-[12px] border border-dashed border-[rgb(44_36_22_/_16%)] bg-[var(--color-soft-white)] p-6 text-center">
                  <ImagePlus
                    aria-hidden="true"
                    className="h-8 w-8 text-[var(--color-teak)]"
                  />
                  <p className="mt-3 text-sm font-black text-[var(--color-ink)]">
                    选择照片后编辑
                  </p>
                </div>
              )}
            </div>

            {validationError && (
              <p className="border-t border-[rgb(44_36_22_/_10%)] px-4 py-3 text-xs leading-5 font-bold text-[var(--color-coral)]">
                {validationError}
              </p>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}

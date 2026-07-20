"use client"

import { type MouseEvent, useCallback, useEffect } from "react"
import { useMapStore } from "@/stores/mapStore"

function formatUploadDate(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

export default function PhotoLightbox() {
  const lightboxPhotoShare = useMapStore((state) => state.lightboxPhotoShare)
  const setLightboxPhotoShare = useMapStore(
    (state) => state.setLightboxPhotoShare
  )

  const closeLightbox = useCallback(() => {
    setLightboxPhotoShare(null)
  }, [setLightboxPhotoShare])

  useEffect(() => {
    if (!lightboxPhotoShare) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeLightbox()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    document.body.style.overflow = "hidden"

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = ""
    }
  }, [lightboxPhotoShare, closeLightbox])

  const handleBackdropClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        closeLightbox()
      }
    },
    [closeLightbox]
  )

  if (!lightboxPhotoShare) return null

  const description = lightboxPhotoShare.caption.trim() || "暂无描述"

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-70 sm:p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex h-[80vh] w-screen flex-col overflow-hidden bg-soft-white shadow-[0_25px_50px_var(--color-ink-30)] sm:h-[600px] sm:max-h-[90vh] sm:w-[900px] sm:max-w-[95vw] sm:flex-row sm:rounded-2xl"
      >
        <div className="flex basis-3/5 items-center justify-center bg-ink">
          <img
            src={lightboxPhotoShare.imageDataUrl}
            alt="照片"
            className="max-h-full max-w-full object-contain"
          />
        </div>
        <aside className="flex basis-2/5 flex-col border-t border-ink-10 bg-soft-white p-6 sm:border-t-0 sm:border-l">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-russet text-sm font-semibold text-soft-white">
              照
            </div>
            <div>
              <div className="text-sm font-semibold text-ink">
                照片分享
              </div>
              <div className="text-xs text-teak">
                位置未记录
              </div>
            </div>
          </div>
          <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">
              {description}
            </p>
          </div>
          <div className="mt-4 border-t border-ink-10 pt-4 text-xs text-teak">
            上传于 {formatUploadDate(lightboxPhotoShare.createdAt)}
          </div>
        </aside>
      </div>
    </div>
  )
}

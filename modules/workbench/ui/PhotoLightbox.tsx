"use client"

import { Trash2 } from "lucide-react"
import { type MouseEvent, useCallback, useEffect, useState } from "react"
import { deletePhoto } from "@/modules/data/photos/client"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

function formatUploadDate(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

export default function PhotoLightbox() {
  const lightboxPhotoShare = useWorkspaceStore(
    (state) => state.lightboxPhotoShare
  )
  const setLightboxPhotoShare = useWorkspaceStore(
    (state) => state.setLightboxPhotoShare
  )
  const removePhotoShare = useWorkspaceStore((state) => state.removePhotoShare)

  const [deleteError, setDeleteError] = useState<string | null>(null)

  const closeLightbox = useCallback(() => {
    setLightboxPhotoShare(null)
  }, [setLightboxPhotoShare])

  const handleDelete = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (!lightboxPhotoShare?.canDelete) return
      setDeleteError(null)
      try {
        await deletePhoto(lightboxPhotoShare.id)
        removePhotoShare(lightboxPhotoShare.id)
        setLightboxPhotoShare(null)
      } catch {
        setDeleteError("删除失败，请重试")
      }
    },
    [lightboxPhotoShare, removePhotoShare, setLightboxPhotoShare]
  )

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
      className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center bg-[rgb(44_36_22_/_70%)] sm:p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex h-[80vh] w-screen flex-col overflow-hidden bg-[var(--periplus-soft-white)] shadow-[0_25px_50px_rgb(44_36_22_/_30%)] sm:h-[600px] sm:max-h-[90vh] sm:w-[900px] sm:max-w-[95vw] sm:flex-row sm:rounded-[16px]"
      >
        <div className="flex basis-3/5 items-center justify-center bg-[var(--periplus-ink)]">
          <img
            src={lightboxPhotoShare.imageDataUrl}
            alt="照片"
            className="max-h-full max-w-full object-contain"
          />
        </div>
        <aside className="flex basis-2/5 flex-col border-t border-[rgb(44_36_22_/_8%)] bg-[var(--periplus-soft-white)] p-6 sm:border-t-0 sm:border-l">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--periplus-russet)] text-sm font-semibold text-[var(--periplus-soft-white)]">
              照
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--periplus-ink)]">
                照片分享
              </div>
              <div className="text-xs text-[var(--periplus-teak)]">
                位置未记录
              </div>
            </div>
          </div>
          <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--periplus-ink)]">
              {description}
            </p>
          </div>
          <div className="mt-4 border-t border-[rgb(44_36_22_/_8%)] pt-4 text-xs text-[var(--periplus-teak)]">
            上传于 {formatUploadDate(lightboxPhotoShare.createdAt)}
          </div>
          {deleteError && (
            <div className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
              {deleteError}
            </div>
          )}
          {lightboxPhotoShare.canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              aria-label="删除照片"
              title="删除"
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-cream)] px-4 py-2 text-sm text-[var(--periplus-coral)] transition hover:bg-[var(--periplus-coral)] hover:text-white"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              删除
            </button>
          )}
        </aside>
      </div>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import RecordDialog from "./RecordDialog"

export default function RecordPhotoViewer({
  photos,
  initialIndex,
  onClose,
}: {
  photos: { url: string; caption?: string | null }[]
  initialIndex: number
  onClose: () => void
}) {
  const [index, setIndex] = useState(initialIndex)
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") setIndex((value) => Math.max(0, value - 1))
      if (event.key === "ArrowRight")
        setIndex((value) => Math.min(photos.length - 1, value + 1))
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [photos.length])
  const photo = photos[index]
  return (
    <RecordDialog
      title={`照片 ${index + 1} / ${photos.length}`}
      onClose={onClose}
      wide
    >
      <div className="relative flex min-h-60 justify-center rounded-xl bg-ink">
        {/* 用户上传的私有图片保留鉴权 URL，不交给远程图片优化代理。 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.caption || `旅行照片 ${index + 1}`}
          className="max-h-[65dvh] w-full object-contain"
        />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label="上一张照片"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
          className="rounded-full border border-ink-15 p-3 disabled:opacity-30"
        >
          <ChevronLeft size={20} />
        </button>
        <p aria-live="polite" className="text-center text-sm text-walnut">
          {photo.caption}
        </p>
        <button
          type="button"
          aria-label="下一张照片"
          disabled={index === photos.length - 1}
          onClick={() => setIndex(index + 1)}
          className="rounded-full border border-ink-15 p-3 disabled:opacity-30"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </RecordDialog>
  )
}

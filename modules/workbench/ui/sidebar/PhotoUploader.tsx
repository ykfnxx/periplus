"use client"

import { ImagePlus } from "lucide-react"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

export default function PhotoUploader() {
  const setUploadModalOpen = useWorkspaceStore((s) => s.setUploadModalOpen)

  return (
    <button
      type="button"
      onClick={() => setUploadModalOpen(true)}
      className="flex h-9 w-full items-center justify-center gap-2 rounded-full bg-[var(--periplus-russet)] px-4 text-xs font-black text-[var(--periplus-soft-white)] transition hover:bg-[var(--periplus-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--periplus-russet)]"
    >
      <ImagePlus aria-hidden="true" className="h-4 w-4" />
      添加照片素材
    </button>
  )
}

"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { X } from "lucide-react"

export default function RecordDialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current!
    const previousFocus = document.activeElement as HTMLElement | null
    dialog.showModal()
    return () => {
      dialog.close()
      previousFocus?.focus()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="record-dialog-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className={`fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border border-ink-10 bg-soft-white p-5 text-ink shadow-periplus backdrop:bg-ink-40 md:p-7 ${wide ? "max-w-4xl" : "max-w-lg"}`}
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 id="record-dialog-title" className="text-xl font-black">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="rounded-full p-2 hover:bg-ink-5 focus-visible:outline-russet"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  )
}

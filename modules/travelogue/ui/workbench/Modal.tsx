"use client"

import { useRef, useState, type ReactNode } from "react"
import { Dialog } from "@/components/kumo/components/dialog/dialog"
import { Button } from "@/components/kumo/components/button/button"
import { X } from "lucide-react"

/** Application composition only: Kumo/Base UI own modality, focus and dismissal. */
export function Modal({
  title,
  children,
  onClose,
  beforeClose,
  className = "w-[560px] p-6",
  hideTitle = false,
  closeClassName = "",
  backdropClassName,
  hideClose = false,
}: {
  title: string
  children: (close: () => void) => ReactNode
  onClose: () => void
  beforeClose?: () => boolean | Promise<boolean>
  className?: string
  hideTitle?: boolean
  closeClassName?: string
  backdropClassName?: string
  hideClose?: boolean
}) {
  const [closing, setClosing] = useState(false)
  const [checking, setChecking] = useState(false)
  async function close() {
    if (closing || checking) return
    setChecking(true)
    try {
      if (beforeClose && !(await beforeClose())) return
      setClosing(true)
    } finally {
      setChecking(false)
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open, details) => {
        if (!open) {
          details.cancel()
          void close()
        }
      }}
    >
      <Dialog
        backdropClassName={backdropClassName}
        closing={closing}
        onMotionComplete={onClose}
        className={`journal-dialog top-1/2! max-h-[calc(100dvh-32px)] -translate-y-1/2 overflow-y-auto ${className}`}
      >
        <Dialog.Title
          className={hideTitle ? "sr-only" : "mb-5 pr-10 text-xl font-black"}
        >
          {title}
        </Dialog.Title>
        {!hideClose && (
          <Dialog.Close
            render={
              <Button
                variant="ghost"
                shape="square"
                aria-label="关闭"
                className={`absolute top-3 right-3 z-20 ${closeClassName}`}
              />
            }
          >
            <X size={20} />
          </Dialog.Close>
        )}
        {children(() => {
          void close()
        })}
      </Dialog>
    </Dialog.Root>
  )
}

export function useConfirmation() {
  const [question, setQuestion] = useState<{
    message: string
    title: string
    cancelLabel: string
    confirmLabel: string
  } | null>(null)
  const resolve = useRef<((answer: boolean) => void) | null>(null)
  function ask(
    message: string,
    { title = "请确认", cancelLabel = "取消", confirmLabel = "继续" } = {}
  ) {
    return new Promise<boolean>((done) => {
      resolve.current = done
      setQuestion({ message, title, cancelLabel, confirmLabel })
    })
  }
  const finish = (answer: boolean) => {
    resolve.current?.(answer)
    resolve.current = null
    setQuestion(null)
  }
  const confirmation = question ? (
    <Dialog.Root
      role="alertdialog"
      open
      onOpenChange={(open) => {
        if (!open) finish(false)
      }}
    >
      <Dialog className="journal-dialog top-1/2! -translate-y-1/2 p-6">
        <Dialog.Title className="text-lg font-bold">
          {question.title}
        </Dialog.Title>
        <Dialog.Description className="my-5 text-sm leading-7 text-walnut">
          {question.message}
        </Dialog.Description>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => finish(false)}>
            {question.cancelLabel}
          </Button>
          <Button variant="primary" onClick={() => finish(true)}>
            {question.confirmLabel}
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  ) : null
  return { ask, confirmation }
}

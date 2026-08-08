"use client"

import { useCallback, useEffect, useRef, type PropsWithChildren } from "react"

const SCROLLBAR_HIDE_DELAY_MS = 650
const MIN_THUMB_HEIGHT_PX = 32
const TRACK_INSET_PX = 4

export default function OverlayScrollArea({
  children,
  className = "",
  viewportClassName = "",
}: PropsWithChildren<{
  className?: string
  viewportClassName?: string
}>) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLSpanElement>(null)
  const hideTimeoutRef = useRef<number | null>(null)

  const updateThumb = useCallback((show: boolean) => {
    const viewport = viewportRef.current
    const thumb = thumbRef.current
    if (!viewport || !thumb) return

    const maxScrollTop = viewport.scrollHeight - viewport.clientHeight
    if (maxScrollTop <= 0) {
      thumb.style.opacity = "0"
      return
    }

    const trackHeight = Math.max(0, viewport.clientHeight - TRACK_INSET_PX * 2)
    const thumbHeight = Math.max(
      MIN_THUMB_HEIGHT_PX,
      (trackHeight * viewport.clientHeight) / viewport.scrollHeight
    )
    const travel = Math.max(0, trackHeight - thumbHeight)
    const offset = (viewport.scrollTop / maxScrollTop) * travel

    thumb.style.height = `${Math.min(trackHeight, thumbHeight)}px`
    thumb.style.transform = `translateY(${offset}px)`

    if (!show) return
    thumb.style.opacity = "0.45"
    if (hideTimeoutRef.current !== null) {
      window.clearTimeout(hideTimeoutRef.current)
    }
    hideTimeoutRef.current = window.setTimeout(() => {
      thumb.style.opacity = "0"
      hideTimeoutRef.current = null
    }, SCROLLBAR_HIDE_DELAY_MS)
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    updateThumb(false)
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => updateThumb(false))
    observer?.observe(viewport)
    if (viewport.firstElementChild instanceof HTMLElement) {
      observer?.observe(viewport.firstElementChild)
    }

    return () => {
      observer?.disconnect()
      if (hideTimeoutRef.current !== null) {
        window.clearTimeout(hideTimeoutRef.current)
      }
    }
  }, [updateThumb])

  return (
    <div
      data-overlay-scroll-area
      className={`relative min-h-0 overflow-hidden ${className}`}
    >
      <div
        ref={viewportRef}
        data-overlay-scroll-viewport
        onScroll={() => updateThumb(true)}
        className={`periplus-chat-scroll scrollbar-hidden h-full overflow-x-hidden overflow-y-auto ${viewportClassName}`}
      >
        {children}
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 right-1 z-30 w-[3px]"
      >
        <span
          ref={thumbRef}
          data-overlay-scroll-thumb
          className="absolute top-0 block w-full rounded-full bg-ink opacity-0 transition-opacity duration-200"
        />
      </span>
    </div>
  )
}

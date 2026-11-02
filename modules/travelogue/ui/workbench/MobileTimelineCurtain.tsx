"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from "motion/react"
import { Button } from "@/components/kumo/components/button/button"

export const collapsedCurtainHeight = 194
export const expandedCurtainHeight = (height: number) =>
  Math.round(height * 0.64)

export default function MobileTimelineCurtain({
  open,
  canOpen,
  viewportHeight,
  onOpen,
  onClose,
  timeline,
  children,
}: {
  open: boolean
  canOpen: boolean
  viewportHeight: number
  onOpen: () => void
  onClose: () => void
  timeline: ReactNode
  children: ReactNode
}) {
  const expandedHeight = Math.max(
    collapsedCurtainHeight,
    expandedCurtainHeight(viewportHeight)
  )
  const height = useMotionValue(open ? expandedHeight : collapsedCurtainHeight)
  const reduced = useReducedMotion()
  const [dragging, setDragging] = useState(false)
  const [raised, setRaised] = useState(open)
  const dragged = useRef(false)
  const pointer = useRef<{
    id: number
    x: number
    y: number
    height: number
    axis: "x" | "y" | null
  } | null>(null)
  // Keep the opaque body until the closing animation reaches its resting height.
  useMotionValueEvent(height, "change", (value) => {
    setRaised(value > collapsedCurtainHeight)
  })
  useEffect(() => {
    if (dragging) return
    const animation = animate(
      height,
      open ? expandedHeight : collapsedCurtainHeight,
      { duration: reduced ? 0 : 0.24, ease: [0.2, 0.8, 0.2, 1] }
    )
    return () => animation.stop()
  }, [open, expandedHeight, dragging, reduced, height])

  return (
    <motion.section
      className="journal-mobile-curtain"
      aria-label="时间轴幕布"
      data-expanded={open}
      style={{ height }}
      onKeyDown={(event) => {
        if (
          open &&
          event.key === "Escape" &&
          !event.defaultPrevented &&
          event.currentTarget.contains(event.target as Node)
        ) {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div
        className="journal-curtain-dial"
        onPointerDownCapture={(event) => {
          if (event.button !== 0 || !canOpen) return
          dragged.current = false
          pointer.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            height: height.get(),
            axis: null,
          }
        }}
        onPointerMoveCapture={(event) => {
          const start = pointer.current
          if (!start || start.id !== event.pointerId) return
          const dx = event.clientX - start.x,
            dy = event.clientY - start.y
          // Resolve the gesture once: sideways browses events, upward reveals
          // the card. Height changes keep the opaque body anchored at bottom.
          if (!start.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
            start.axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x"
            if (start.axis === "y") {
              event.currentTarget.setPointerCapture(event.pointerId)
              dragged.current = true
              setDragging(true)
            }
          }
          if (start.axis !== "y") return
          event.preventDefault()
          event.stopPropagation()
          height.set(
            Math.min(
              expandedHeight,
              Math.max(collapsedCurtainHeight, start.height - dy)
            )
          )
        }}
        onPointerUpCapture={(event) => {
          const start = pointer.current
          pointer.current = null
          if (start?.axis !== "y") return
          event.stopPropagation()
          const dy = event.clientY - start.y
          const expand =
            Math.abs(dy) > 50
              ? dy < 0
              : height.get() > (expandedHeight + collapsedCurtainHeight) / 2
          setDragging(false)
          if (expand) onOpen()
          else onClose()
        }}
        onPointerCancel={() => {
          pointer.current = null
          dragged.current = false
          setDragging(false)
        }}
        onClickCapture={(event) => {
          const dragClick = dragged.current && event.detail > 0
          dragged.current = false
          if (dragClick) {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
      >
        {timeline}
        {canOpen && (
          <Button
            variant="ghost"
            className="journal-curtain-handle"
            aria-label={open ? "收起事件卡片" : "展开事件卡片"}
            aria-expanded={open}
            onClick={() => (open ? onClose() : onOpen())}
          >
            <span />
          </Button>
        )}
      </div>
      {(open || dragging || raised) && (
        <div className="journal-curtain-body">{children}</div>
      )}
    </motion.section>
  )
}

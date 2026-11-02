"use client"

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react"
import { Maximize2, Minimize2 } from "lucide-react"
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
  const [full, setFull] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [raised, setRaised] = useState(open)
  const [reading, setReading] = useState(false)
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
    setReading(value > expandedHeight + 1)
    if (value <= collapsedCurtainHeight) setFull(false)
  })
  useEffect(() => {
    if (dragging) return
    const animation = animate(
      height,
      open ? (full ? viewportHeight : expandedHeight) : collapsedCurtainHeight,
      { duration: reduced ? 0 : 0.24, ease: [0.2, 0.8, 0.2, 1] }
    )
    return () => animation.stop()
  }, [open, full, viewportHeight, expandedHeight, dragging, reduced, height])

  const dragHandlers = {
    onPointerDownCapture(event: PointerEvent<HTMLDivElement>) {
      // Photo portals still reach React capture handlers, outside this DOM area.
      if (
        event.button !== 0 ||
        !canOpen ||
        !event.currentTarget.contains(event.target as Node)
      )
        return
      dragged.current = false
      pointer.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        height: height.get(),
        axis: null,
      }
    },
    onPointerMoveCapture(event: PointerEvent<HTMLDivElement>) {
      const start = pointer.current
      if (!start || start.id !== event.pointerId) return
      const dx = event.clientX - start.x,
        dy = event.clientY - start.y
      // Sideways browses events. Vertical movement raises the same curtain
      // through its preview and full-screen stops without resizing the map.
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
          viewportHeight,
          Math.max(collapsedCurtainHeight, start.height - dy)
        )
      )
    },
    onPointerUpCapture(event: PointerEvent<HTMLDivElement>) {
      const start = pointer.current
      pointer.current = null
      if (start?.axis !== "y") return
      event.stopPropagation()
      const dy = event.clientY - start.y
      const stops = [collapsedCurtainHeight, expandedHeight, viewportHeight]
      let next = stops.reduce(
        (closest, stop, i) =>
          Math.abs(stop - height.get()) <
          Math.abs(stops[closest] - height.get())
            ? i
            : closest,
        0
      )
      if (dy < -50)
        next = Math.max(next, start.height < expandedHeight - 1 ? 1 : 2)
      if (dy > 50)
        next = Math.min(next, start.height > expandedHeight + 1 ? 1 : 0)
      setFull(next === 2)
      setDragging(false)
      if (next > 0) onOpen()
      else onClose()
    },
    onPointerCancel() {
      pointer.current = null
      dragged.current = false
      setDragging(false)
    },
    onClickCapture(event: MouseEvent<HTMLDivElement>) {
      if (!event.currentTarget.contains(event.target as Node)) return
      const dragClick = dragged.current && event.detail > 0
      dragged.current = false
      if (dragClick) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
  }

  return (
    <motion.section
      className="journal-mobile-curtain"
      aria-label="时间轴幕布"
      data-expanded={open}
      data-fullscreen={full}
      data-reading={reading}
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
      <div className="journal-curtain-dial" {...dragHandlers}>
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
        {open && canOpen && (
          <Button
            variant="ghost"
            shape="square"
            className="journal-curtain-resize"
            aria-label={full ? "退出全屏阅读" : "全屏阅读事件"}
            title={full ? "退出全屏阅读" : "全屏阅读事件"}
            onClick={() => setFull(!full)}
          >
            {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </Button>
        )}
      </div>
      {(open || dragging || raised) && (
        <div className="journal-curtain-body" {...(!full ? dragHandlers : {})}>
          {children}
        </div>
      )}
    </motion.section>
  )
}

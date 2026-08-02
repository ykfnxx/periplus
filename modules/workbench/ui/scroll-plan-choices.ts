import type { WheelEvent } from "react"

export function scrollPlanChoicesHorizontally(
  event: WheelEvent<HTMLDivElement>
) {
  const scroller = event.currentTarget
  const delta =
    Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY
  if (!delta) return

  const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
  const nextScrollLeft = Math.min(
    maxScrollLeft,
    Math.max(0, scroller.scrollLeft + delta)
  )
  if (nextScrollLeft === scroller.scrollLeft) return

  event.preventDefault()
  scroller.scrollTo({ left: nextScrollLeft, behavior: "smooth" })
}

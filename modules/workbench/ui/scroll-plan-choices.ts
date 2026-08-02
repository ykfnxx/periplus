import { useCallback, useRef } from "react"

export function scrollPlanChoicesHorizontally(
  scroller: HTMLDivElement,
  event: WheelEvent
) {
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

export function usePlanChoiceWheelScroll() {
  const detachListener = useRef<(() => void) | null>(null)

  return useCallback((scroller: HTMLDivElement | null) => {
    detachListener.current?.()
    detachListener.current = null
    if (!scroller) return

    const handleWheel = (event: WheelEvent) =>
      scrollPlanChoicesHorizontally(scroller, event)
    scroller.addEventListener("wheel", handleWheel, { passive: false })
    detachListener.current = () =>
      scroller.removeEventListener("wheel", handleWheel)
  }, [])
}

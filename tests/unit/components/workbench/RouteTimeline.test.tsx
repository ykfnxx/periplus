import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import RouteTimeline from "@/components/workbench/RouteTimeline"
import { silkRoadRoute } from "@/lib/mock-routes"

describe("RouteTimeline", () => {
  it("renders ordered points and opens editor", () => {
    const onEditPoint = vi.fn()
    render(
      <RouteTimeline
        route={silkRoadRoute}
        editingPointId={null}
        onEditPoint={onEditPoint}
        onChangePoint={() => {}}
      />
    )
    expect(screen.getByText("西安")).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole("button", { name: /编辑/ })[0])
    expect(onEditPoint).toHaveBeenCalledWith("p1")
  })
})

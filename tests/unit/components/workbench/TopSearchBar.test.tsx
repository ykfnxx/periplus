import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import TopSearchBar from "@/components/workbench/TopSearchBar"

describe("TopSearchBar", () => {
  it("renders the Periplus search input", () => {
    render(<TopSearchBar searchQuery="" onSearchQueryChange={() => {}} />)
    expect(screen.getByText("Periplus")).toBeInTheDocument()
    expect(
      screen.getByRole("searchbox", { name: "搜索地点、路线、标签或备注" })
    ).toBeInTheDocument()
  })
})

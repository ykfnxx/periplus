import { useState } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import ResizableMapPanel from "@/modules/travelogue/ui/workbench/ResizableMapPanel"
import EventEditor from "@/modules/travelogue/ui/events/EventEditor"
import { eventContent } from "@/modules/travelogue/model/event-draft"
// Sizing is covered in browser checks; keep this test focused on React identity.
vi.mock("react-resizable-panels", () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))
it("preserves input, selected files and draft identity across desktop/mobile layout changes", () => {
  let mounts = 0
  function Form() {
    const [id] = useState(() => ++mounts)
    const [value, setValue] = useState("")
    const [file, setFile] = useState<File>()
    return (
      <>
        <output data-testid="id">{id}</output>
        <input
          aria-label="正文"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <input
          aria-label="照片"
          type="file"
          onChange={(e) => setFile(e.target.files![0])}
        />
        <output>{file?.name}</output>
      </>
    )
  }
  Object.defineProperty(window, "innerWidth", { value: 1440, writable: true })
  render(
    <ResizableMapPanel>
      <Form />
    </ResizableMapPanel>
  )
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "尚未保存" },
  })
  fireEvent.change(screen.getByLabelText("照片"), {
    target: { files: [new File(["photo"], "selected.jpg")] },
  })
  for (const width of [390, 1440, 768, 767]) {
    act(() => {
      window.innerWidth = width
      window.dispatchEvent(new Event("resize"))
    })
    expect(screen.getByRole("textbox")).toHaveValue("尚未保存")
    expect(screen.getByText("selected.jpg")).toBeVisible()
    expect(screen.getByTestId("id")).toHaveTextContent("1")
  }
  expect(mounts).toBe(1)
})
it("reflects controlled busy, uncertain save and error states without user interaction", () => {
  const props = {
    entry: undefined,
    draft: eventContent(),
    files: [],
    busy: true,
    pendingSave: false,
    error: null,
    status: "",
    dirty: false,
    uploads: [],
    saving: 0,
    onChange: vi.fn(),
    onFiles: vi.fn(),
    onSave: vi.fn(),
    revisionNotice: null,
    renderPhotos: () => null,
    onClose: vi.fn(),
    onPickLocation: vi.fn(),
    onPickTransitLocation: vi.fn(),
  }
  const view = render(<EventEditor {...props} />)
  expect(screen.getByRole("textbox", { name: "记录标题" })).toBeDisabled()
  view.rerender(
    <EventEditor
      {...props}
      busy={false}
      pendingSave
      error="响应未收到，请确认上次保存"
    />
  )
  expect(screen.getByRole("alert")).toHaveTextContent("响应未收到")
  expect(screen.getByRole("textbox", { name: "记录标题" })).toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "确认上次保存" }))
  expect(props.onSave).toHaveBeenCalledOnce()
  view.rerender(<EventEditor {...props} busy={false} />)
  expect(screen.getByRole("textbox", { name: "记录标题" })).not.toBeDisabled()
})

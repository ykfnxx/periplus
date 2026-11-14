import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import EventComposer from "@/modules/travelogue/ui/events/EventComposer"
import { eventContent } from "@/modules/travelogue/model/event-draft"

beforeEach(() => {
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL() {
        return "blob:photo"
      }
      static revokeObjectURL() {}
    }
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it("lets a rejected uncommitted photo be removed while confirmed event content stays locked", () => {
  const invalid = new File(["large"], "too-large.png", { type: "image/png" })
  const valid = new File(["small"], "saved.png", { type: "image/png" })
  const onFiles = vi.fn()
  render(
    <EventComposer
      draft={eventContent()}
      files={[invalid, valid]}
      photos={[]}
      uploads={[]}
      busy
      filesBusy={false}
      onChange={vi.fn()}
      onFiles={onFiles}
      onPickLocation={vi.fn()}
    />
  )
  expect(screen.getByLabelText("记录标题")).toBeDisabled()
  expect(screen.getByRole("button", { name: "添加照片" })).toBeEnabled()
  fireEvent.click(
    screen.getByRole("button", { name: "移除待上传照片 too-large.png" })
  )
  expect(onFiles).toHaveBeenCalledWith([valid])
})

it("keeps photo input locked while an attachment request has an unconfirmed result", () => {
  render(
    <EventComposer
      draft={eventContent()}
      files={[new File(["photo"], "pending.png")]}
      photos={[]}
      uploads={[]}
      busy
      filesBusy
      onChange={vi.fn()}
      onFiles={vi.fn()}
      onPickLocation={vi.fn()}
    />
  )
  expect(screen.getByRole("button", { name: "添加照片" })).toBeDisabled()
  expect(
    screen.getByRole("button", { name: "移除待上传照片 pending.png" })
  ).toBeDisabled()
})

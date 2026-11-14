import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { checkFrontendBoundaries } from "../../scripts/check-frontend-boundaries.mjs"
const temporary: string[] = []
afterEach(() => {
  temporary
    .splice(0)
    .forEach((dir) => rmSync(dir, { recursive: true, force: true }))
})
function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "periplus-boundary-"))
  temporary.push(root)
  files["tsconfig.json"] = JSON.stringify({
    compilerOptions: {
      baseUrl: ".",
      paths: { "@/*": ["./*"] },
      moduleResolution: "bundler",
      module: "esnext",
    },
    include: ["**/*.ts"],
  })
  for (const [name, content] of Object.entries(files)) {
    const file = join(root, name)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
  return root
}
it("accepts the complete production frontend graph", () => {
  expect(checkFrontendBoundaries()).toEqual([])
})
it.each([
  'import { save } from "@/modules/travelogue/adapters/http"',
  'export { save } from "../adapters/http"',
  'const adapter = import("../adapters/http")',
  'const adapter = require("../adapters/http")',
])("rejects adapters hidden behind a barrel: %s", (link) => {
  const root = fixture({
    "modules/travelogue/ui/card.ts": 'import "../shared"',
    "modules/travelogue/shared.ts": link.replace(
      '"../adapters/http"',
      '"./adapters/http"'
    ),
    "modules/travelogue/adapters/http.ts": "export const save = () => {}",
  })
  expect(
    checkFrontendBoundaries(root).some((error: string) =>
      error.includes("ui/card.ts reaches modules/travelogue/adapters/http.ts")
    )
  ).toBe(true)
})
it("rejects browser state in application code and production imports of preview scenes", () => {
  const root = fixture({
    "modules/travelogue/application/save.ts":
      "window.localStorage.setItem('x', 'y')",
    "app/page.ts": 'import "@/modules/travelogue/ui/card.preview"',
    "modules/travelogue/ui/card.preview.ts": "export const scene = 1",
  })
  const errors = checkFrontendBoundaries(root)
  expect(errors).toContainEqual(
    expect.stringContaining("window crosses the business boundary")
  )
  expect(errors).toContainEqual(
    expect.stringContaining("development-only preview")
  )
})

it("rejects application access to concrete database modules", () => {
  const root = fixture({
    "modules/travelogue/application/save.ts":
      'import "@/modules/data/db/prisma"',
    "modules/data/db/prisma.ts": "export const client = {}",
  })
  expect(checkFrontendBoundaries(root)).toContainEqual(
    expect.stringContaining(
      "application/save.ts reaches modules/data/db/prisma.ts"
    )
  )
})

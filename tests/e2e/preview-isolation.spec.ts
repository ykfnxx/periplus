import { expect, test } from "@playwright/test"
test("development component previews are unavailable in production", async ({ request }) => {
  expect((await request.get("/ui-preview")).status()).toBe(404)
})

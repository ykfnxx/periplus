import { readFile } from "node:fs/promises"
import { join } from "node:path"

export const dynamic = "force-dynamic"

export async function GET() {
  const version =
    process.env.NODE_ENV === "development"
      ? "development"
      : (await readFile(join(process.cwd(), ".next/BUILD_ID"), "utf8")).trim()
  return new Response(
    `
const CACHE = ${JSON.stringify(`periplus-drafts-${version}`)};
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const response = await fetch("/drafts", { cache: "no-store" });
    if (!response.ok) throw new Error("Draft entry could not be cached");
    const html = await response.clone().text();
    const assets = [...html.matchAll(/(?:src|href)="([^" ]+)"/g)]
      .map((match) => match[1].replaceAll("&amp;", "&"))
      .filter((url) => url.startsWith("/_next/static/"));
    const cache = await caches.open(CACHE);
    await cache.addAll([...new Set(assets)]);
    await cache.put("/drafts", response);
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("periplus-drafts-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      try { return await fetch(event.request, { cache: "no-store" }); }
      catch {
        if (url.pathname !== "/drafts") return Response.redirect(new URL("/drafts", url.origin));
        return await caches.match("/drafts", { cacheName: CACHE });
      }
    })());
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      return await caches.match(event.request, { cacheName: CACHE }) || fetch(event.request);
    })());
  }
});
`,
    {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
        "Service-Worker-Allowed": "/",
      },
    }
  )
}

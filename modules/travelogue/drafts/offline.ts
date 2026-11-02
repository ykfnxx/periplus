export async function prepareOfflineDrafts() {
  if (!window.isSecureContext || !("serviceWorker" in navigator)) return false
  const existing = await navigator.serviceWorker.getRegistration("/")
  if (existing?.active && !navigator.onLine) return true
  const registration = await navigator.serviceWorker.register(
    "/drafts-worker",
    { scope: "/" }
  )
  if (!registration.active) {
    const worker = registration.installing || registration.waiting!
    await new Promise<void>((resolve, reject) => {
      const changed = () => {
        if (worker.state === "activated") resolve()
        if (worker.state === "redundant")
          reject(new Error("离线资源未能保存。"))
      }
      worker.addEventListener("statechange", changed)
      changed()
    })
  }
  return true
}

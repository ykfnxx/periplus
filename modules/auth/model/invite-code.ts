export function normalizeInviteCode(value: string) {
  return value.replace(/\s+/g, "").toUpperCase()
}

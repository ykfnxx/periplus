export const periplusPublicConfig = {
  app: {
    get baseUrl() {
      return process.env.NEXT_PUBLIC_PERIPLUS_APP_URL ?? "http://localhost:3001"
    },
  },
  amap: {
    get key() {
      return process.env.NEXT_PUBLIC_AMAP_KEY ?? ""
    },
  },
  dev: {
    get showMockAccounts() {
      return process.env.NEXT_PUBLIC_PERIPLUS_SHOW_MOCK_ACCOUNTS !== "false"
    },
  },
} as const

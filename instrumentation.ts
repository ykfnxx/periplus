export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { periplusServerConfig } = await import("./config/periplus.server")
      void periplusServerConfig.auth.secret
      if (process.env.PERIPLUS_RUNTIME !== "cloudflare")
        void periplusServerConfig.database.url
    } catch (error) {
      console.error("Invalid server configuration", error)
      process.exit(1)
    }
  }
}

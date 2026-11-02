export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { periplusServerConfig } = await import("./config/periplus.server")
      void periplusServerConfig.auth.secret
      void periplusServerConfig.database.url
    } catch (error) {
      console.error("Invalid server configuration", error)
      process.exit(1)
    }
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { periplusServerConfig } = await import("./config/periplus.server")
    // Validate required configuration before accepting requests.
    void periplusServerConfig.auth.secret
    void periplusServerConfig.database.url
  }
}

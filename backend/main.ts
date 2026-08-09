import { loadProjectEnv } from "@/config/env.server"

loadProjectEnv()
await import("./observability/register")
await import("./server")

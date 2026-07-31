import { homedir } from "node:os"
import { join } from "node:path"
import { periplusPublicConfig } from "./periplus"

function envString(name: string, fallback = "") {
  return process.env[name] || fallback
}

function envNumber(name: string, fallback: number) {
  const value = envString(name)
  if (!value) return fallback

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const periplusServerConfig = {
  app: {
    get baseUrl() {
      return periplusPublicConfig.app.baseUrl
    },
    get frontendOrigin() {
      return envString(
        "PERIPLUS_FRONTEND_ORIGIN",
        periplusPublicConfig.app.baseUrl
      )
    },
  },
  auth: {
    get secret() {
      return envString(
        "BETTER_AUTH_SECRET",
        "periplus-dev-secret-change-before-production-000000"
      )
    },
  },
  database: {
    get url() {
      return envString("DATABASE_URL", "file:./dev.db")
    },
  },
  amap: {
    get webServiceKey() {
      // JS API 与 Web 服务使用不同类型的 Key，不能互相回退。
      return envString("PERIPLUS_AMAP_WEB_SERVICE_KEY")
    },
  },
  transitPlanning: {
    get retention() {
      return envString("PERIPLUS_TRANSIT_PLAN_RETENTION", "SESSION_ONLY") ===
        "PERSISTED"
        ? ("PERSISTED" as const)
        : ("SESSION_ONLY" as const)
    },
  },
  agentBackend: {
    get url() {
      return periplusPublicConfig.agentBackend.url
    },
    get host() {
      return envString("PERIPLUS_BACKEND_HOST", "127.0.0.1")
    },
    get port() {
      return envNumber("PERIPLUS_BACKEND_PORT", 3002)
    },
  },
  kimi: {
    get bin() {
      return envString(
        "PERIPLUS_KIMI_BIN",
        join(homedir(), ".kimi-code/bin/kimi")
      )
    },
    get homeSource() {
      return envString(
        "PERIPLUS_KIMI_HOME_SOURCE",
        join(homedir(), ".kimi-code")
      )
    },
  },
} as const

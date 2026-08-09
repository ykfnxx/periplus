import "@testing-library/jest-dom/vitest"
import { loadProjectEnv } from "@/config/env.server"

process.env.PERIPLUS_OBSERVABILITY_ID_SALT ??= "unit-test-observability-salt"
loadProjectEnv()

import { spawn } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("Periplus Pi extension", () => {
  it("loads only the selected Periplus tools in Pi RPC mode", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "periplus-pi-extension-"))
    const agentDir = join(workDir, "agent")
    const runConfigPath = join(workDir, "run.json")
    await mkdir(agentDir, { recursive: true })
    await writeFile(
      join(agentDir, "models.json"),
      JSON.stringify({
        providers: {
          deepseek: {
            baseUrl: "https://api.deepseek.com",
            apiKey: "$DEEPSEEK_API_KEY",
            models: [
              {
                id: "deepseek-v4-flash",
                name: "DeepSeek Responses",
                api: "openai-responses",
                contextWindow: 1000000,
                maxTokens: 32768,
                input: ["text"],
              },
            ],
          },
        },
      })
    )
    await writeFile(
      runConfigPath,
      JSON.stringify({
        backendUrl: "http://127.0.0.1:3002",
        capabilityToken: "capability-token",
        model: "deepseek-v4-flash",
        toolNames: ["periplus_workspace_get_context"],
      })
    )

    try {
      const child = spawn(
        join(process.cwd(), "node_modules/.bin/pi"),
        [
          "--mode",
          "rpc",
          "--no-session",
          "--provider",
          "deepseek",
          "--model",
          "deepseek-v4-flash",
          "--no-builtin-tools",
          "--no-context-files",
          "--no-skills",
          "--no-prompt-templates",
          "--no-themes",
          "--no-extensions",
          "--extension",
          join(
            process.cwd(),
            "backend/agent/pi-extension/periplus-runtime-extension.ts"
          ),
        ],
        {
          cwd: workDir,
          env: {
            NODE_ENV: "test",
            PATH: process.env.PATH,
            HOME: agentDir,
            PI_CODING_AGENT_DIR: agentDir,
            PERIPLUS_PI_RUN_CONFIG: runConfigPath,
            DEEPSEEK_API_KEY: "test-key",
          },
        }
      )
      const response = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          let stdout = ""
          let stderr = ""
          const timer = setTimeout(
            () => reject(new Error(`Pi did not answer get_state: ${stderr}`)),
            5000
          )
          child.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString("utf8")
            const newline = stdout.indexOf("\n")
            if (newline < 0) return
            clearTimeout(timer)
            resolve(
              JSON.parse(stdout.slice(0, newline)) as Record<string, unknown>
            )
          })
          child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString("utf8")
          })
          child.on("error", reject)
          child.stdin.write(
            `${JSON.stringify({ id: "state", type: "get_state" })}\n`
          )
        }
      )
      expect(response).toMatchObject({
        id: "state",
        type: "response",
        command: "get_state",
        success: true,
      })
      const closed = new Promise<void>((resolve) =>
        child.on("close", () => resolve())
      )
      child.stdin.end()
      await closed
    } finally {
      await rm(workDir, { recursive: true, force: true })
    }
  })
})

import { spawn } from "node:child_process"
import { copyFile, mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type {
  AgentRuntime,
  AgentRuntimeObserver,
  AgentRuntimeRequest,
  AgentRuntimeRun,
} from "../runtime"

interface KimiCodeRuntimeOptions {
  binary: string
  identityHomeSource: string
}

export class KimiCodeRuntime implements AgentRuntime {
  readonly id = "kimi-code"

  constructor(private readonly options: KimiCodeRuntimeOptions) {}

  async start(
    request: AgentRuntimeRequest,
    observer: AgentRuntimeObserver
  ): Promise<AgentRuntimeRun> {
    const workDir = await mkdtemp(join(tmpdir(), "periplus-agent-"))
    const kimiHome = join(workDir, "kimi-home")
    await this.prepareIdentity(kimiHome)
    await this.writeToolConfiguration(workDir, kimiHome, request)

    const metadata = { runtimeId: this.id, workDir }
    const child = spawn(this.options.binary, ["-p", request.prompt], {
      cwd: workDir,
      env: {
        ...process.env,
        KIMI_CODE_HOME: kimiHome,
      },
    })

    child.stdout.on("data", (chunk: Buffer) => {
      observer.onStdout(chunk.toString("utf8"))
    })
    child.stderr.on("data", (chunk: Buffer) => {
      observer.onStderr(chunk.toString("utf8"))
    })
    child.on("error", (error) => {
      observer.onError(error)
    })
    child.on("close", (code) => {
      observer.onExit({ code, metadata })
    })

    return {
      metadata,
      cancel: () => {
        child.kill("SIGTERM")
      },
    }
  }

  private async prepareIdentity(kimiHome: string) {
    await mkdir(kimiHome, { recursive: true })

    for (const fileName of ["config.toml", "tui.toml", "device_id"]) {
      await copyFile(
        join(this.options.identityHomeSource, fileName),
        join(kimiHome, fileName)
      ).catch(() => undefined)
    }
  }

  private async writeToolConfiguration(
    workDir: string,
    kimiHome: string,
    request: AgentRuntimeRequest
  ) {
    if (request.toolServers.length === 0) return

    const entries = await Promise.all(
      request.toolServers.map(async (server) => {
        const args = [...server.args]
        if (server.configFile) {
          const configPath = join(workDir, server.configFile.fileName)
          await writeFile(configPath, server.configFile.content)
          args.push(server.configFile.argument, configPath)
        }

        return [
          server.id,
          {
            command: server.command,
            args,
            cwd: server.cwd,
          },
        ] as const
      })
    )
    const mcpServers = Object.fromEntries(entries)

    await writeFile(
      join(kimiHome, "mcp.json"),
      JSON.stringify({ mcpServers }, null, 2)
    )
  }
}

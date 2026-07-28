export interface AgentToolServer {
  id: string
  command: string
  args: string[]
  cwd: string
  configFile?: {
    fileName: string
    content: string
    argument: string
  }
}

export interface AgentRuntimeRequest {
  runId: string
  prompt: string
  toolServers: AgentToolServer[]
}

export interface AgentRuntimeMetadata {
  runtimeId: string
  workDir?: string
}

export interface AgentRuntimeExit {
  code: number | null
  metadata: AgentRuntimeMetadata
}

export interface AgentRuntimeObserver {
  onStdout: (text: string) => void
  onStderr: (text: string) => void
  onError: (error: Error) => void
  onExit: (result: AgentRuntimeExit) => void
}

export interface AgentRuntimeRun {
  metadata: AgentRuntimeMetadata
  cancel: () => void
}

export interface AgentRuntime {
  readonly id: string
  start(
    request: AgentRuntimeRequest,
    observer: AgentRuntimeObserver
  ): Promise<AgentRuntimeRun>
}

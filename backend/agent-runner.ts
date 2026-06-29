import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DraftStore } from './draft-store';
import type { AgentEventEmitter } from './types';

interface AgentRunnerOptions {
  backendUrl: string;
  projectRoot: string;
}

interface RunningAgent {
  runId: string;
  process: ChildProcessWithoutNullStreams;
  cancelled: boolean;
  workDir: string;
}

const kimiBin = process.env.PERIPLUS_KIMI_BIN ?? '/Users/yangkefan/.kimi-code/bin/kimi';

async function copyKimiIdentity(kimiHome: string) {
  const sourceHome = process.env.PERIPLUS_KIMI_HOME_SOURCE ?? join(homedir(), '.kimi-code');
  await mkdir(kimiHome, { recursive: true });

  for (const fileName of ['config.toml', 'tui.toml', 'device_id']) {
    await copyFile(join(sourceHome, fileName), join(kimiHome, fileName)).catch(() => undefined);
  }
}

function buildPrompt(prompt: string) {
  return [
    '你是 Periplus 的路线规划 Agent。',
    '只能通过 MCP 工具读取和修改当前草稿，不要读写项目文件，不要直接连接数据库。',
    '所有路线修改都应该作用于当前草稿；保存由用户在前端触发。',
    '',
    '用户需求：',
    prompt,
  ].join('\n');
}

export class AgentRunner {
  private readonly runs = new Map<string, RunningAgent>();

  constructor(
    private readonly store: DraftStore,
    private readonly options: AgentRunnerOptions
  ) {}

  async start(sessionId: string, prompt: string, emit: AgentEventEmitter) {
    if (this.runs.has(sessionId) || this.store.isLocked(sessionId)) {
      emit(sessionId, {
        type: 'error',
        payload: { message: '当前草稿正在由 Agent 修改' },
      });
      return;
    }

    const runId = `run-${randomUUID()}`;
    const workDir = join('/tmp', `periplus-agent-${randomUUID()}`);
    const kimiHome = join(workDir, 'kimi-home');
    await mkdir(workDir, { recursive: true });
    await copyKimiIdentity(kimiHome);
    await writeFile(
      join(kimiHome, 'mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            'periplus-draft': {
              command: join(this.options.projectRoot, 'node_modules/.bin/tsx'),
              args: ['backend/mcp/server.ts'],
              cwd: this.options.projectRoot,
              env: {
                PERIPLUS_BACKEND_URL: this.options.backendUrl,
                PERIPLUS_SESSION_ID: sessionId,
              },
            },
          },
        },
        null,
        2
      )
    );

    this.store.lock(sessionId, runId);
    emit(sessionId, { type: 'draft.locked', payload: this.store.getSnapshot(sessionId) });
    emit(sessionId, { type: 'agent.run.started', payload: { runId } });

    const child = spawn(kimiBin, ['-p', buildPrompt(prompt)], {
      cwd: workDir,
      env: {
        ...process.env,
        KIMI_CODE_HOME: kimiHome,
        PERIPLUS_BACKEND_URL: this.options.backendUrl,
        PERIPLUS_SESSION_ID: sessionId,
      },
    });
    const running: RunningAgent = { runId, process: child, cancelled: false, workDir };
    this.runs.set(sessionId, running);

    child.stdout.on('data', (chunk: Buffer) => {
      emit(sessionId, {
        type: 'agent.message.delta',
        payload: { runId, stream: 'stdout', text: chunk.toString('utf8') },
      });
    });
    child.stderr.on('data', (chunk: Buffer) => {
      emit(sessionId, {
        type: 'agent.message.delta',
        payload: { runId, stream: 'stderr', text: chunk.toString('utf8') },
      });
    });
    child.on('error', (error) => {
      emit(sessionId, { type: 'agent.run.failed', payload: { runId, message: error.message } });
    });
    child.on('close', (code) => {
      this.runs.delete(sessionId);
      this.store.unlock(sessionId, runId);
      emit(sessionId, { type: 'draft.unlocked', payload: this.store.getSnapshot(sessionId) });
      emit(sessionId, {
        type: running.cancelled ? 'agent.run.cancelled' : code === 0 ? 'agent.run.completed' : 'agent.run.failed',
        payload: { runId, code, workDir },
      });
    });
  }

  cancel(sessionId: string) {
    const running = this.runs.get(sessionId);
    if (!running) return;

    running.cancelled = true;
    running.process.kill('SIGTERM');
  }
}

import { createServer } from 'node:http';
import { AgentRunner } from './agent-runner';
import { DraftStore } from './draft-store';
import { handleInternalRequest } from './internal-api';
import { createAgentWebSocketServer } from './ws';
import type { AgentEventEmitter } from './types';

const port = Number(process.env.PERIPLUS_BACKEND_PORT ?? 3002);
const backendUrl = process.env.PERIPLUS_BACKEND_URL ?? `http://127.0.0.1:${port}`;
const store = new DraftStore();
let broadcast: AgentEventEmitter = () => undefined;

const server = createServer((req, res) => {
  handleInternalRequest(req, res, store, broadcast).catch((error) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'internal_error', message: error.message } }));
  });
});
const runner = new AgentRunner(store, {
  backendUrl,
  projectRoot: process.cwd(),
});

broadcast = createAgentWebSocketServer(server, store, runner);

server.listen(port, '127.0.0.1', () => {
  console.log(`Periplus backend listening on ${backendUrl}`);
});

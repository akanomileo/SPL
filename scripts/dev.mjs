import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const backend = spawn(
  process.execPath,
  [
    '--experimental-strip-types',
    fileURLToPath(new URL('../server/index.mjs', import.meta.url)),
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: '3001',
      NODE_ENV: 'development',
      PUBLIC_ORIGIN: 'http://localhost:3000',
    },
  },
);
const frontend = spawn(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
    '--host',
    '127.0.0.1',
    '--port',
    '3000',
    '--strictPort',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  },
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  backend.kill();
  frontend.kill();
  process.exitCode = code;
}
for (const child of [backend, frontend]) {
  child.on('error', () => stop(1));
  child.on('exit', (code) => stop(code ?? 0));
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0));

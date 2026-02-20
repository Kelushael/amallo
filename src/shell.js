/**
 * Persistent bash shell that maintains cwd and environment between calls.
 * Uses a sentinel pattern: after every command we print a unique delimiter
 * so we know when output is done.
 */
import { spawn } from 'child_process';

const SENTINEL = '__AMALLO_DONE__';

export function createShell() {
  const bash = spawn('bash', ['--norc', '--noprofile'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let outputBuf = '';
  let errorBuf  = '';
  let resolver  = null;

  bash.stdout.on('data', (chunk) => {
    outputBuf += chunk.toString();
    if (resolver && outputBuf.includes(SENTINEL)) {
      const out = outputBuf.replace(new RegExp(`.*${SENTINEL}\\n?`, 's'), '').trimEnd();
      // extract the part before sentinel
      const parts = outputBuf.split(SENTINEL);
      const result = parts[0].trimEnd();
      outputBuf = parts.slice(1).join(SENTINEL);
      const err = errorBuf.trim();
      errorBuf = '';
      const res = resolver;
      resolver = null;
      res({ output: result, error: err });
    }
  });

  bash.stderr.on('data', (chunk) => {
    errorBuf += chunk.toString();
  });

  function run(command, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      resolver = (val) => {
        clearTimeout(timer);
        resolve(val);
      };

      // Flush stderr into stdout sentinel area by echoing sentinel after both
      bash.stdin.write(`${command}\necho ${SENTINEL}\n`);
    });
  }

  async function exec(command) {
    const { output, error } = await run(command);
    const combined = [output, error].filter(Boolean).join('\n');
    const isError  = error.length > 0 && output.length === 0;
    return { output: combined || '(no output)', isError };
  }

  function close() {
    bash.stdin.end();
  }

  return { exec, close };
}

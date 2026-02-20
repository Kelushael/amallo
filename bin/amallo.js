#!/usr/bin/env node
/**
 * amallo — AI terminal agent
 *
 * Usage:
 *   amallo [task]               start agent with default model
 *   amallo run <model> [task]   use specific model
 *   amallo models               list available models
 *
 * Within a session:
 *   /models   — list and switch model
 *   /exit     — quit
 */
import { createInterface } from 'readline';
import { LOCAL_OLLAMA, DEFAULT_MODEL } from '../src/config.js';
import { OllamaClient }   from '../src/ollama.js';
import { runAgent }       from '../src/agent.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

function banner() {
  console.log('\x1b[1m\x1b[35m');
  console.log('  █████╗ ███╗   ███╗ █████╗ ██╗     ██╗      ██████╗ ');
  console.log(' ██╔══██╗████╗ ████║██╔══██╗██║     ██║     ██╔═══██╗');
  console.log(' ███████║██╔████╔██║███████║██║     ██║     ██║   ██║');
  console.log(' ██╔══██║██║╚██╔╝██║██╔══██║██║     ██║     ██║   ██║');
  console.log(' ██║  ██║██║ ╚═╝ ██║██║  ██║███████╗███████╗╚██████╔╝');
  console.log(' ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝ ╚═════╝ ');
  console.log('\x1b[0m  AI Terminal Agent  |  /models  /exit\n');
}

async function getClient() {
  const client = new OllamaClient(LOCAL_OLLAMA);
  if (!(await client.ping())) {
    console.error('[amallo] Ollama is not running. Start it with: ollama serve');
    process.exit(1);
  }
  return client;
}

async function cmdModels() {
  const client = new OllamaClient(LOCAL_OLLAMA);
  const models = await client.listModels();
  console.log('\nAvailable models:');
  models.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
  rl.close();
}

async function cmdRun({ modelArg, taskArg }) {
  banner();
  const client = await getClient();
  const models = await client.listModels();

  let model = modelArg || DEFAULT_MODEL;
  // if specified model not found, use first available
  if (!models.includes(model) && models.length) {
    console.log(`[amallo] Model '${model}' not found, using '${models[0]}'`);
    model = models[0];
  }

  let prompt = taskArg;

  if (!prompt) {
    console.log(`Models: ${models.join('  |  ')}`);
    console.log('Type /models to switch, /exit to quit.\n');
    prompt = await ask('Task: ');
  }

  if (prompt.trim() === '/models') {
    models.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
    const choice = await ask('Pick number: ');
    const idx = parseInt(choice, 10) - 1;
    if (models[idx]) model = models[idx];
    prompt = await ask('Task: ');
  }

  if (prompt.trim() === '/exit') { rl.close(); return; }

  await runAgent({ ollama: client, model, userPrompt: prompt });
  rl.close();
}

// ── CLI entry ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args[0] === 'models') {
  await cmdModels();
} else if (args[0] === 'run') {
  // amallo run <model> [task...]
  const modelArg = args[1];
  const taskArg  = args.slice(2).join(' ') || null;
  await cmdRun({ modelArg, taskArg });
} else {
  const taskArg = args.join(' ') || null;
  await cmdRun({ modelArg: null, taskArg });
}

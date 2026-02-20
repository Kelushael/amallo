#!/usr/bin/env node
/**
 * amallo — conversational AI terminal agent
 *
 *   amallo                        interactive chat
 *   amallo "do something"         start with a task
 *   amallo run <model> [task]     pick a model
 *   amallo models                 list models
 */
import { LOCAL_OLLAMA, DEFAULT_MODEL } from '../src/config.js';
import { OllamaClient }               from '../src/ollama.js';
import { runAgent }                   from '../src/agent.js';

const C = { reset: '\x1b[0m', bold: '\x1b[1m', purple: '\x1b[35m', dim: '\x1b[2m', green: '\x1b[32m' };

function banner() {
  console.log(`\n${C.purple}${C.bold}  amallo${C.reset}${C.dim}  AI terminal agent  |  /models  /exit${C.reset}\n`);
}

async function getClient() {
  const client = new OllamaClient(LOCAL_OLLAMA);
  if (!(await client.ping())) {
    console.error('  Ollama not running. Start it: ollama serve');
    process.exit(1);
  }
  return client;
}

async function resolveModel(client, preferred) {
  try {
    const models = await client.listModels();
    if (models.includes(preferred)) return preferred;
    if (models.length) {
      console.log(`${C.dim}  '${preferred}' not found, using '${models[0]}'${C.reset}`);
      return models[0];
    }
  } catch {}
  return preferred;
}

// ── amallo models ─────────────────────────────────────────────────────────────
async function cmdModels() {
  const client = new OllamaClient(LOCAL_OLLAMA);
  const models = await client.listModels();
  console.log('\n  Available models:');
  models.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
  console.log();
}

// ── amallo [run <model>] [task] ───────────────────────────────────────────────
async function cmdRun(modelArg, taskArg) {
  banner();
  const client = await getClient();
  const model  = await resolveModel(client, modelArg || DEFAULT_MODEL);

  console.log(`${C.dim}  ${model}${C.reset}\n`);

  await runAgent({ ollama: client, model, initialPrompt: taskArg || null });
}

// ── entry ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args[0] === 'models') {
  await cmdModels();
} else if (args[0] === 'run') {
  await cmdRun(args[1], args.slice(2).join(' ') || null);
} else {
  await cmdRun(null, args.join(' ') || null);
}

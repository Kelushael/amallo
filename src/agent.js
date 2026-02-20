/**
 * Core agent loop: prompts model, parses bash/write blocks,
 * runs them with user approval, feeds results back.
 */
import { createInterface } from 'readline';
import { writeFileSync }   from 'fs';
import { SYSTEM_PROMPT, MAX_RETRIES } from './config.js';
import { createShell }     from './shell.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

function parseBlock(text) {
  // bash block
  const bash = text.match(/```bash\n([\s\S]*?)\n```/);
  if (bash) return { kind: 'bash', payload: bash[1].trim() };

  // write block
  const write = text.match(/```write:(.+?)\n([\s\S]*?)\n```/);
  if (write) return { kind: 'write', path: write[1].trim(), payload: write[2] };

  return null;
}

function writeFile(path, content) {
  try {
    writeFileSync(path, content);
    return { out: `File written: ${path}`, isError: false };
  } catch (e) {
    return { out: e.message, isError: true };
  }
}

export async function runAgent({ ollama, model, userPrompt }) {
  const shell = createShell();

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user',   content: userPrompt },
  ];

  let retries = 0;

  console.log(`\n[amallo] model=${model}  server=${ollama.baseUrl}\n`);

  try {
    while (retries < MAX_RETRIES) {
      const reply = await ollama.chat(model, messages);
      console.log(`\n\x1b[36m[model]\x1b[0m\n${reply}\n`);

      if (reply.includes('DONE')) {
        console.log('[amallo] Task complete.');
        break;
      }

      const block = parseBlock(reply);
      if (!block) {
        console.log('[amallo] No actionable block. Stopping.');
        break;
      }

      messages.push({ role: 'assistant', content: reply });

      // ── bash block ──────────────────────────────────────────────────────
      if (block.kind === 'bash') {
        console.log(`\x1b[33m[command]\x1b[0m\n${block.payload}\n`);
        const ans = await ask('Execute? [y/N]: ');
        if (ans.toLowerCase() !== 'y') { console.log('Skipped.'); break; }

        const { output, isError } = await shell.exec(block.payload);
        console.log(`\x1b[32m[output]\x1b[0m\n${output}\n`);

        if (isError) {
          retries++;
          messages.push({ role: 'user', content: `Error:\n${output}\n\nFix it.` });
        } else {
          retries = 0;
          messages.push({ role: 'user', content: `Terminal output:\n${output}` });
        }
      }

      // ── write block ─────────────────────────────────────────────────────
      else if (block.kind === 'write') {
        const preview = block.payload.split('\n').slice(0, 10).join('\n');
        console.log(`\x1b[33m[write]\x1b[0m ${block.path}\n${preview}\n${block.payload.split('\n').length > 10 ? '...' : ''}`);
        const ans = await ask(`Write file '${block.path}'? [y/N]: `);
        if (ans.toLowerCase() !== 'y') { console.log('Skipped.'); break; }

        const { out, isError } = writeFile(block.path, block.payload);
        console.log(`[result] ${out}`);

        if (isError) {
          retries++;
          messages.push({ role: 'user', content: `File write failed: ${out}\n\nFix it.` });
        } else {
          retries = 0;
          messages.push({ role: 'user', content: out });
        }
      }
    }

    if (retries >= MAX_RETRIES) {
      console.log(`[amallo] Max retries (${MAX_RETRIES}) reached.`);
    }
  } finally {
    shell.close();
    rl.close();
  }
}

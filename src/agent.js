/**
 * Conversational agent loop — persistent back-and-forth like Claude Code.
 */
import { createInterface } from 'readline';
import { writeFileSync }   from 'fs';
import { SYSTEM_PROMPT }   from './config.js';
import { createShell }     from './shell.js';

// ── colours ───────────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  cyan:   '\x1b[36m',
  yellow: '\x1b[33m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  purple: '\x1b[35m',
};

function print(color, label, text) {
  process.stdout.write(`${color}${C.bold}${label}${C.reset} ${text}\n`);
}

// ── block parsing ─────────────────────────────────────────────────────────────
function parseBlock(text) {
  const bash = text.match(/```bash\n([\s\S]*?)\n```/);
  if (bash) return { kind: 'bash', payload: bash[1].trim() };

  const write = text.match(/```write:(.+?)\n([\s\S]*?)\n```/);
  if (write) return { kind: 'write', path: write[1].trim(), payload: write[2] };

  return null;
}

// ── file write ────────────────────────────────────────────────────────────────
function writeFile(path, content) {
  try {
    writeFileSync(path, content);
    return { out: `File written: ${path}`, isError: false };
  } catch (e) {
    return { out: e.message, isError: true };
  }
}

// ── streaming-style print (char by char feel) ─────────────────────────────────
async function printReply(text) {
  process.stdout.write(`\n${C.purple}${C.bold}amallo${C.reset}  `);
  // print in small chunks so it feels live
  const words = text.split(' ');
  for (const word of words) {
    process.stdout.write(word + ' ');
    await new Promise(r => setTimeout(r, 8));
  }
  process.stdout.write('\n');
}

// ── main loop ─────────────────────────────────────────────────────────────────
export async function runAgent({ ollama, model, initialPrompt }) {
  const shell = createShell();

  const rl = createInterface({
    input:  process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const ask = (prompt) => new Promise((resolve) => {
    rl.question(prompt, resolve);
  });

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  if (initialPrompt) {
    messages.push({ role: 'user', content: initialPrompt });
  }

  let autoRespond = !!initialPrompt; // if we have an initial prompt, go straight to model

  console.log(`\n${C.dim}  model: ${model}   /models /exit${C.reset}\n`);

  try {
    while (true) {
      // ── get user input (unless we're auto-responding after a command) ────────
      if (!autoRespond) {
        const raw = await ask(`\n${C.cyan}${C.bold}you${C.reset}  `);
        const input = raw.trim();

        if (!input) continue;
        if (input === '/exit' || input === 'exit') break;

        if (input === '/models') {
          try {
            const models = await ollama.listModels();
            models.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
            const choice = await ask('  pick number (enter to keep current): ');
            const idx = parseInt(choice, 10) - 1;
            if (models[idx]) {
              model = models[idx];
              print(C.green, '✓', `switched to ${model}`);
            }
          } catch (e) {
            print(C.red, '!', e.message);
          }
          continue;
        }

        messages.push({ role: 'user', content: input });
      }
      autoRespond = false;

      // ── call model ───────────────────────────────────────────────────────────
      process.stdout.write(`\n${C.dim}  thinking…${C.reset}`);
      let reply;
      try {
        reply = await ollama.chat(model, messages);
      } catch (e) {
        process.stdout.write('\r' + ' '.repeat(20) + '\r');
        print(C.red, 'error', e.message);
        continue;
      }
      process.stdout.write('\r' + ' '.repeat(20) + '\r');

      // ── display reply ────────────────────────────────────────────────────────
      await printReply(reply);

      messages.push({ role: 'assistant', content: reply });

      // ── check for action block ───────────────────────────────────────────────
      const block = parseBlock(reply);
      if (!block) continue;

      // ── bash block ───────────────────────────────────────────────────────────
      if (block.kind === 'bash') {
        const ans = await ask(`\n${C.yellow}  run?${C.reset} [Y/n] `);
        if (ans.toLowerCase() === 'n') {
          messages.push({ role: 'user', content: 'I skipped that command. Please suggest an alternative or explain.' });
          autoRespond = true;
          continue;
        }

        process.stdout.write(`${C.dim}  running…${C.reset}\n`);
        const { output, isError } = await shell.exec(block.payload);

        const label = isError ? `${C.red}  error${C.reset}` : `${C.green}  output${C.reset}`;
        console.log(`${label}\n${C.dim}${output}${C.reset}`);

        messages.push({
          role: 'user',
          content: isError
            ? `Command failed with error:\n${output}\n\nPlease fix it.`
            : `Command succeeded. Output:\n${output}`,
        });
        autoRespond = true; // model should react to the output automatically
      }

      // ── write block ──────────────────────────────────────────────────────────
      else if (block.kind === 'write') {
        const ans = await ask(`\n${C.yellow}  write ${block.path}?${C.reset} [Y/n] `);
        if (ans.toLowerCase() === 'n') {
          messages.push({ role: 'user', content: 'I skipped the file write. Please adjust.' });
          autoRespond = true;
          continue;
        }

        const { out, isError } = writeFile(block.path, block.payload);
        const label = isError ? `${C.red}  error${C.reset}` : `${C.green}  ✓${C.reset}`;
        console.log(`${label} ${out}`);

        messages.push({
          role: 'user',
          content: isError ? `File write failed: ${out}. Fix it.` : out,
        });
        autoRespond = true;
      }
    }
  } finally {
    shell.close();
    rl.close();
    console.log(`\n${C.dim}  session ended${C.reset}\n`);
  }
}

# amallo

AI terminal agent powered by Ollama. Runs commands in a persistent shell, writes files, and self-corrects on errors.

## Install

```sh
curl axismundi.fun/install.sh | sh
```

Or via npm:

```sh
npm install -g github:Kelushael/amallo
```

## Usage

```sh
amallo                            # interactive session
amallo "create a flask app"       # inline task
amallo run glm-5:cloud            # specific model
amallo run qwen2.5-coder:7b "fix this"
amallo models                     # list available models
```

**Within a session:**
- `/models` — switch model
- `/exit` — quit

## How it works

1. You give it a task
2. The model generates a `bash` or `write:<path>` block
3. You approve each action before it runs
4. Terminal output/errors feed back to the model automatically
5. It self-corrects until the task is done or `DONE` is returned

## Requirements

- Node.js 18+
- [Ollama](https://ollama.com) running locally (`ollama serve`)

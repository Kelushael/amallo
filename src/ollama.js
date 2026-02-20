/**
 * Minimal Ollama REST client (no npm dep, just fetch — built into Node 18+).
 */
export class OllamaClient {
  constructor(baseUrl = 'http://127.0.0.1:11434') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async listModels() {
    const res = await fetch(`${this.baseUrl}/api/tags`);
    if (!res.ok) throw new Error(`Ollama error ${res.status}`);
    const data = await res.json();
    return (data.models || []).map((m) => m.name);
  }

  async chat(model, messages) {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Ollama ${res.status}: ${txt}`);
    }
    const data = await res.json();
    return data.message?.content ?? '';
  }

  async ping() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}

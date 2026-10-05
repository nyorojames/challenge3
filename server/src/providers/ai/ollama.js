// Ollama: a model running locally on the laptop (no internet needed once downloaded).
// Install from https://ollama.com, then: ollama pull llama3.2:3b
// Docs: https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion
import { config } from '../../config.js';
import { parseJsonText } from './json.js';

export async function askOllama(systemPrompt, sentence, signal) {
  const response = await fetch(`${config.OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.OLLAMA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: sentence },
      ],
      format: 'json', // forces the model to answer with valid JSON
      stream: false,
      options: { temperature: 0 },
    }),
    signal,
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`); // 404 = model not pulled

  const data = await response.json();
  if (!data.message?.content) throw new Error('Ollama returned no text');
  return parseJsonText(data.message.content);
}

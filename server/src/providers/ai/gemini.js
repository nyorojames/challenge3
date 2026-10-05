// Google Gemini (free tier with a Google AI Studio key).
// Docs: https://ai.google.dev/api/generate-content
import { config } from '../../config.js';
import { parseJsonText } from './json.js';

export async function askGemini(systemPrompt, sentence, signal) {
  if (!config.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');

  const response = await fetch(`${config.GEMINI_URL}/models/${config.LLM_MODEL}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.GEMINI_API_KEY, // header, not ?key=, so the key never appears in logged URLs
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: sentence }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    }),
    signal,
  });
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`); // 429 = free-tier limit hit

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no text');
  return parseJsonText(text);
}

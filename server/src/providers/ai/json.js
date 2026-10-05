// LLMs sometimes wrap JSON in ```json ... ``` fences even when asked not to.
// Strip that, then parse. Throws if it still is not JSON (which triggers the fallback).
export function parseJsonText(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

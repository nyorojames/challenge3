// Transaction ids are made on the device so an entry saved offline keeps the
// same id when it syncs later (the server ignores a repeated id).
//
// crypto.randomUUID() only exists on https:// or localhost. If the app is
// opened on a phone over the laptop's Wi-Fi IP (http://192.168...), it is
// missing, so we build a version-4 UUID from crypto.getRandomValues instead.
export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

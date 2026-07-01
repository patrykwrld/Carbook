/**
 * Derives a one-way, non-reversible commenter identifier from request
 * material (IP + User-Agent) and a server-side salt. This is only ever
 * used for abuse control (rate limits, flag weighting) — it's never
 * displayed and comments carry no identity beyond an optional free-text
 * display name the commenter chooses themselves.
 */
export async function hashUser(salt: string, ip: string, userAgent: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}:${userAgent}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(digest);
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derives a one-way, non-reversible user identifier from request material
 * (IP + User-Agent) and a server-side salt. This is the only "identity"
 * Driver Signal ever stores — it cannot be mapped back to a person, and is
 * used solely for abuse control and dedupe bucketing.
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

/**
 * WHY: Shared utility for bypassing Vercel's 4.5 MB serverless function payload
 * limit by uploading files directly to the Go pipeline service.
 *
 * Both upload paths (new session + add document) use this to get a direct
 * upload target. If UPLOAD_TOKEN_SECRET is not configured, returns null and
 * the caller falls back to the Vercel proxy route.
 */

interface DirectUploadTarget {
  url: string;
  headers: Record<string, string>;
}

interface TokenResponse {
  token: string;
  userId: string;
  goServiceUrl: string;
}

async function fetchUploadToken(): Promise<TokenResponse | null> {
  try {
    const res = await fetch('/api/sessions/upload-token');
    if (!res.ok) return null; // 503 = UPLOAD_TOKEN_SECRET not set, fall back to proxy
    const data = (await res.json()) as TokenResponse;
    if (!data.token || !data.userId || !data.goServiceUrl) return null;
    return data;
  } catch {
    return null; // Network error — fall back to proxy
  }
}

/** Direct target for new-session uploads → Go's /pipeline/upload */
export async function getDirectUploadTarget(): Promise<DirectUploadTarget | null> {
  const data = await fetchUploadToken();
  if (!data) return null;
  return {
    url: `${data.goServiceUrl}/pipeline/upload`,
    headers: { 'X-Upload-Token': data.token, 'X-User-Id': data.userId },
  };
}

/** Direct target for add-document uploads → Go's /pipeline/document/:sessionId */
export async function getDirectDocumentUploadTarget(
  sessionId: string,
): Promise<DirectUploadTarget | null> {
  const data = await fetchUploadToken();
  if (!data) return null;
  return {
    url: `${data.goServiceUrl}/pipeline/document/${sessionId}`,
    headers: { 'X-Upload-Token': data.token, 'X-User-Id': data.userId },
  };
}

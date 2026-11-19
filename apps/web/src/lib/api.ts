const TOKEN_KEY = 'dollarino_token';
let memoryToken: string | null = null;

export function getStoredToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) memoryToken = saved;
    return saved;
  } catch {
    return memoryToken;
  }
}

export function setStoredToken(token: string | null) {
  memoryToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Restricted iframe storage fallback uses memoryToken
  }
}

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) {
    if (!headers.Authorization) headers.Authorization = `Bearer ${token}`;
    headers['X-Dollarino-Token'] = token;
  }

  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers,
  });

  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Server error (${res.status}): ${text.slice(0, 120)}`);
  }

  if (!res.ok) {
    const errObj = json as { error?: string };
    throw new Error(errObj.error || `HTTP ${res.status}`);
  }
  return json as T;
}

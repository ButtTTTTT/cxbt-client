let memoryToken: string | null = null;

export function getToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    const sessionTok = sessionStorage.getItem('cxbt_token');
    if (sessionTok) {
      memoryToken = sessionTok;
      return sessionTok;
    }
    if (sessionStorage.getItem('cxbt_logged_out') === '1') {
      return null;
    }
    const localTok = localStorage.getItem('cxbt_token');
    if (localTok) {
      memoryToken = localTok;
      sessionStorage.setItem('cxbt_token', localTok);
      return localTok;
    }
  } catch {}
  return null;
}

export function setToken(token: string) {
  memoryToken = token;
  try {
    sessionStorage.removeItem('cxbt_logged_out');
    sessionStorage.setItem('cxbt_token', token);
    localStorage.setItem('cxbt_token', token);
  } catch {}
}

export function clearToken() {
  memoryToken = null;
  try {
    sessionStorage.setItem('cxbt_logged_out', '1');
    sessionStorage.removeItem('cxbt_token');
  } catch {}
}

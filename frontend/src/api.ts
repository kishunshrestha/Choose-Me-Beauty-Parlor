let csrf = '';
export function setCsrf(value: string) { csrf = value; }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const upload = options.body instanceof FormData;
  const response = await fetch(`/api${path}`, {...options, credentials: 'same-origin', headers: {
    ...(!upload && options.body ? {'Content-Type':'application/json'} : {}),
    ...(csrf ? {'X-CSRF-Token': csrf} : {}), ...options.headers,
  }});
  const data = await response.json().catch(()=>({error:'The server did not respond. Please try again.'}));
  if (!response.ok) {
    if (response.status === 401 && path.startsWith('/admin') && path !== '/admin/session') window.dispatchEvent(new Event('session-expired'));
    throw new Error(data.error || 'Something went wrong. Please try again.');
  }
  return data;
}
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

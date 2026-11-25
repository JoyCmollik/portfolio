export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isForm = options.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers: { ...(!isForm && options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorData = data as { error?: string; issues?: { field: string; message: string }[] };
    const details = errorData.issues?.map(i => `${i.field}: ${i.message}`).join('; ');
    throw new Error(details || errorData.error || `Request failed (${response.status})`);
  }
  return data as T;
}
export function safeUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch { return ''; }
}
export function readableDate(value?: string | null) {
  if (!value) return 'Recently';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recently' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}
export function readingTime(markdown: string) { return Math.max(1, Math.ceil((markdown || '').trim().split(/\s+/).length / 220)); }

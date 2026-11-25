export function slugifyTitle(input = '') {
  return String(input).normalize('NFKD').toLowerCase()
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 100);
}
export function publicUser(user) {
  return { id: String(user._id), name: user.name, email: user.email,
    avatar: user.avatar, role: user.role, status: user.status };
}
export function safeHref(value) {
  if (typeof value !== 'string' || !value) return '';
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try { const parsed = new URL(value); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : ''; }
  catch { return ''; }
}

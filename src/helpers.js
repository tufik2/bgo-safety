export function parseIdentifier(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  if (t.includes('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) ? { type: 'email', value: t.toLowerCase() } : null;
  }
  if (/[a-z]/i.test(t)) return null;
  let d = t.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length !== 10) return null;
  return { type: 'phone', value: `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` };
}
export const normPhone = (p) => {
  const r = parseIdentifier(p);
  return r && r.type === 'phone' ? r.value : '';
};
export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const makeCode = () => String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
export const initials = (u) => (((u.firstName || '?')[0] || '') + ((u.lastName || '')[0] || '')).toUpperCase();
export const fullName = (u) => [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Unnamed user';

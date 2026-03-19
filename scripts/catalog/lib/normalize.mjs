export function isSentinel(value) {
  if (value == null) return true;
  const s = String(value).trim().toLowerCase();
  return s === '' || s === 'not specified' || s === 'n/a';
}

export function normalizeToNull(value) {
  if (isSentinel(value)) return null;
  return String(value).trim();
}

export function normalizeToArray(value) {
  const v = normalizeToNull(value);
  if (v == null) return [];
  return v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
}

export function normalizeBool(value) {
  const v = normalizeToNull(value);
  if (v == null) return null;
  if (/^true$/i.test(v)) return true;
  if (/^false$/i.test(v)) return false;
  return null;
}

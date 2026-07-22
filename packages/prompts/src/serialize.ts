const SECRET_KEYS = new Set([
  'apiKey',
  'authorization',
  'secret',
  'token',
  'hiddenGoal',
  'privateMemory',
]);

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value === null || typeof value !== 'object') return value;

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (!SECRET_KEYS.has(key)) result[key] = sanitize((value as Record<string, unknown>)[key]);
  }
  return result;
}

export function promptJson(value: unknown): string {
  return JSON.stringify(sanitize(value), null, 2);
}

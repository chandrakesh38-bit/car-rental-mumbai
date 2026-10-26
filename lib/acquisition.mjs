// Only coarse marketing attribution is stored. Never retain full referrer URLs, queries or click IDs.
export function sanitizeAcquisition(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { source: 'unknown', medium: 'unknown' };
  const safe = (value, max = 120) => typeof value === 'string' ? value.slice(0, max).replace(/[^a-zA-Z0-9 _./-]/g, '') : '';
  const source = safe(input.source) || 'unknown';
  const medium = safe(input.medium) || 'unknown';
  return {
    source, medium, campaign: safe(input.campaign),
    referrerHost: safe(input.referrerHost), landingPage: safe(input.landingPage, 200),
    clickIdPresent: input.clickIdPresent === true,
    capturedAt: /^\d{4}-\d{2}-\d{2}T/.test(input.capturedAt || '') ? input.capturedAt.slice(0, 24) : ''
  };
}

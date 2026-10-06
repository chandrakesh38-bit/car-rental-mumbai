// Public configuration only. Never return credentials here.
export const config = { runtime: 'edge' };

export default function handler(request) {
  const host = new URL(request.url).hostname.toLowerCase();
  const projectId = String(process.env.CLARITY_PRODUCTION_PROJECT_ID || '').trim();
  const enabled = process.env.VERCEL_ENV === 'production'
    && ['carswithdriverindia.com', 'www.carswithdriverindia.com'].includes(host)
    && /^[a-z0-9]{6,20}$/.test(projectId);

  return new Response(JSON.stringify(enabled
    ? { enabled: true, projectId, environment: 'production' }
    : { enabled: false }), {
    status: request.method === 'GET' ? 200 : 405,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

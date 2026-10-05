// Public configuration only. Never return credentials or enable production here.
export const config = { runtime: 'edge' };

export default function handler(request) {
  const projectId = String(process.env.CLARITY_TESTING_PROJECT_ID || '').trim();
  const enabled = process.env.VERCEL_ENV === 'preview'
    && ['testing', 'codex/clarity-testing'].includes(process.env.VERCEL_GIT_COMMIT_REF)
    && /^[a-z0-9]{6,20}$/.test(projectId);
  return new Response(JSON.stringify(enabled
    ? { enabled: true, projectId, environment: 'testing' }
    : { enabled: false }), {
    status: request.method === 'GET' ? 200 : 405,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

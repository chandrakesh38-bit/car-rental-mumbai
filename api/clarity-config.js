// Public configuration only. Never return credentials here.
export const config = { runtime: 'edge' };

export default function handler(request) {
  const env = process.env.VERCEL_ENV;
  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  const host = new URL(request.url).hostname.toLowerCase();
  const testingId = String(process.env.CLARITY_TESTING_PROJECT_ID || '').trim();
  const productionId = String(process.env.CLARITY_PRODUCTION_PROJECT_ID || '').trim();

  let projectId = '';
  let environment = '';

  if (env === 'preview'
      && ['testing', 'codex/clarity-testing'].includes(branch)
      && /^[a-z0-9]{6,20}$/.test(testingId)) {
    projectId = testingId;
    environment = 'testing';
  } else if (env === 'production'
      && ['carswithdriverindia.com', 'www.carswithdriverindia.com'].includes(host)
      && /^[a-z0-9]{6,20}$/.test(productionId)) {
    projectId = productionId;
    environment = 'production';
  }

  return new Response(JSON.stringify(projectId
    ? { enabled: true, projectId, environment }
    : { enabled: false }), {
    status: request.method === 'GET' ? 200 : 405,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

import { verifyAccessToken } from '../lib/mobile-otp.mjs';
export async function otpProof(purpose, origin, phone = '9999999999') {
  process.env.MSG91_AUTH_KEY = 'test-msg91-server-key-not-real';
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ type: 'success', data: { mobile: '91' + phone } });
    return (await verifyAccessToken('test-provider-access-token', phone, purpose, origin)).proof;
  } finally { globalThis.fetch = original; }
}

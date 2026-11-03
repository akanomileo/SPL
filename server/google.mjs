import { randomBytes, createHash, createPublicKey, verify } from 'node:crypto';
import { HttpError, validateEmail } from './store.mjs';
const fail = (status, message) => {
  throw new HttpError(status, message);
};
const random = () => randomBytes(32).toString('base64url');
export function googleConfiguration(env) {
  const fields = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
  ];
  if (!fields.some((key) => env[key]?.trim())) return null;
  if (fields.some((key) => !env[key]?.trim()))
    throw new Error(
      'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI together.',
    );
  const redirect = new URL(env.GOOGLE_REDIRECT_URI);
  if (
    redirect.username ||
    redirect.password ||
    redirect.search ||
    redirect.hash ||
    redirect.pathname !== '/api/auth/google/callback' ||
    !(
      redirect.protocol === 'https:' ||
      (env.NODE_ENV !== 'production' &&
        redirect.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(redirect.hostname))
    )
  )
    throw new Error(
      'GOOGLE_REDIRECT_URI must be HTTPS (or localhost for development), ending /api/auth/google/callback.',
    );
  if (
    env.NODE_ENV === 'production' &&
    new URL(env.PUBLIC_ORIGIN).origin !== redirect.origin
  )
    throw new Error('Google callback must use PUBLIC_ORIGIN.');
  return {
    clientId: env.GOOGLE_CLIENT_ID.trim(),
    clientSecret: env.GOOGLE_CLIENT_SECRET.trim(),
    redirectUri: redirect.href,
  };
}
export function verifyGoogleToken(
  token,
  keys,
  { clientId, nonce, now = Date.now() },
) {
  try {
    if (typeof token !== 'string' || token.length > 20000) throw new Error();
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error();
    const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
    const jwk = keys.find(
      (key) =>
        key.kid === header.kid &&
        key.kty === 'RSA' &&
        (!key.use || key.use === 'sig') &&
        (!key.alg || key.alg === 'RS256'),
    );
    if (
      header.alg !== 'RS256' ||
      !jwk ||
      !verify(
        'RSA-SHA256',
        Buffer.from(parts[0] + '.' + parts[1]),
        createPublicKey({ key: jwk, format: 'jwk' }),
        Buffer.from(parts[2], 'base64url'),
      )
    )
      throw new Error();
    const seconds = Math.floor(now / 1000);
    if (
      !['https://accounts.google.com', 'accounts.google.com'].includes(
        claims.iss,
      ) ||
      claims.aud !== clientId ||
      (claims.azp && claims.azp !== clientId) ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= seconds ||
      !Number.isFinite(claims.iat) ||
      claims.iat > seconds + 60 ||
      (claims.nbf && claims.nbf > seconds + 60) ||
      claims.nonce !== nonce ||
      claims.email_verified !== true ||
      typeof claims.sub !== 'string' ||
      !/^[A-Za-z0-9_-]{1,255}$/.test(claims.sub)
    )
      throw new Error();
    // Google is authoritative for Gmail or verified Workspace mail. Other email
    // addresses may have changed hands since Google originally verified them.
    const email = validateEmail(claims.email);
    if (
      !email.endsWith('@gmail.com') &&
      (typeof claims.hd !== 'string' ||
        claims.hd.toLowerCase() !== email.split('@')[1])
    )
      throw new Error();
    return {
      subject: claims.sub,
      email,
      name:
        typeof claims.name === 'string'
          ? claims.name.trim().slice(0, 80) || email
          : email,
    };
  } catch {
    fail(
      401,
      'Google sign-in could not be verified. Use a Gmail or Google Workspace account and try again.',
    );
  }
}
export function createGoogleAuth(
  store,
  config,
  { fetchImpl = fetch, now = Date.now } = {},
) {
  let cached = null;
  async function request(url, options) {
    const response = await fetchImpl(url, {
      ...options,
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok)
      fail(502, 'Google sign-in is unavailable. Please try again.');
    const body = await response.json();
    return { body, response };
  }
  async function keys(refresh = false) {
    if (!refresh && cached && cached.until > now()) return cached.keys;
    const { body } = await request(
      'https://www.googleapis.com/oauth2/v3/certs',
    );
    if (!Array.isArray(body.keys) || body.keys.length > 20)
      fail(502, 'Google sign-in is unavailable.');
    cached = { keys: body.keys, until: now() + 5 * 60_000 };
    return cached.keys;
  }
  return {
    start({ audience, setupCode, returnTo = '/' }) {
      if (!config)
        fail(503, 'Google sign-in has not been configured by the shop.');
      if (!['/', '/?checkout=1', '/account/'].includes(returnTo))
        fail(400, 'Invalid sign-in destination.');
      if (!['owner', 'customer'].includes(audience))
        fail(400, 'Invalid sign-in page.');
      const ownerSetupHash =
        audience === 'owner' && !store.ownerInfo().configured
          ? store.validateOwnerSetup(setupCode)
          : null;
      const state = random(),
        binding = random(),
        nonce = random(),
        verifier = random();
      store.saveGoogleFlow(state, binding, {
        nonce,
        verifier,
        audience,
        ownerSetupHash,
        returnTo,
      });
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: createHash('sha256')
          .update(verifier)
          .digest('base64url'),
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }).toString();
      return { url: url.href, binding };
    },
    async finish({ state, binding, code, error }) {
      if (!config) fail(503, 'Google sign-in is not configured.');
      const flow = store.consumeGoogleFlow(state, binding);
      if (error) fail(400, 'Google sign-in was cancelled. Please try again.');
      if (typeof code !== 'string' || !code || code.length > 4096)
        fail(400, 'Invalid Google sign-in response.');
      const { body } = await request('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: 'authorization_code',
          code,
          code_verifier: flow.verifier,
        }).toString(),
      });
      let jwks = await keys();
      // Refresh once for a new signing-key ID, including during key rotation.
      try {
        const kid = JSON.parse(
          Buffer.from(body.id_token.split('.')[0], 'base64url'),
        ).kid;
        if (!jwks.some((key) => key.kid === kid)) jwks = await keys(true);
      } catch {
        fail(401, 'Invalid Google sign-in response.');
      }
      const identity = verifyGoogleToken(body.id_token, jwks, {
        clientId: config.clientId,
        nonce: flow.nonce,
        now: now(),
      });
      const user = store.googleUser(identity, {
        audience: flow.audience,
        ownerSetupHash: flow.ownerSetupHash,
      });
      return {
        user,
        destination: user.role === 'owner' ? '/owner/' : (flow.returnTo ?? '/'),
      };
    },
  };
}

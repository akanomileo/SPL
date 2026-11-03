import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  sign,
  randomBytes,
  createHash,
} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyGoogleToken, googleConfiguration } from '../server/google.mjs';
import { createBackend } from '../server/http.mjs';
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const key = {
  ...publicKey.export({ format: 'jwk' }),
  kid: 'test-key',
  alg: 'RS256',
  use: 'sig',
};
const clientId = 'test-client.apps.googleusercontent.com';
const claims = (extra = {}) => ({
  iss: 'https://accounts.google.com',
  aud: clientId,
  sub: 'subject-customer',
  email: 'customer@gmail.com',
  email_verified: true,
  name: 'Google Customer',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
  nonce: 'test-nonce',
  ...extra,
});
function jwt(value, header = { alg: 'RS256', kid: key.kid }) {
  const payload = [header, value]
    .map((v) => Buffer.from(JSON.stringify(v)).toString('base64url'))
    .join('.');
  return (
    payload +
    '.' +
    sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64url')
  );
}
test('Google JWT signatures and identity claims reject forged or mismatched identities', () => {
  const options = { clientId, nonce: 'test-nonce' };
  assert.equal(
    verifyGoogleToken(jwt(claims()), [key], options).email,
    'customer@gmail.com',
  );
  for (const invalid of [
    { aud: 'other-client' },
    { nonce: 'another-flow' },
    { iss: 'https://attacker.test' },
    { exp: 0 },
    { iat: Math.floor(Date.now() / 1000) + 1000 },
    { email_verified: false },
    { email: 'owner@example.test' },
    { sub: '' },
  ])
    assert.throws(() =>
      verifyGoogleToken(jwt(claims(invalid)), [key], options),
    );
  assert.throws(() =>
    verifyGoogleToken(
      jwt(claims(), { alg: 'none', kid: key.kid }),
      [key],
      options,
    ),
  );
  const token = jwt(claims());
  assert.throws(() =>
    verifyGoogleToken(
      token.slice(0, -20) + 'AAAAAAAAAAAAAAAAAAAA',
      [key],
      options,
    ),
  );
  assert.equal(
    verifyGoogleToken(
      jwt(claims({ email: 'owner@workspace.test', hd: 'workspace.test' })),
      [key],
      options,
    ).email,
    'owner@workspace.test',
  );
});
test('Google configuration requires complete server secrets and secure matching callback', () => {
  assert.equal(googleConfiguration({}), null);
  assert.throws(() => googleConfiguration({ GOOGLE_CLIENT_ID: clientId }));
  const base = {
    GOOGLE_CLIENT_ID: clientId,
    GOOGLE_CLIENT_SECRET: 'test-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:4174/api/auth/google/callback',
  };
  assert.equal(googleConfiguration(base).clientId, clientId);
  assert.throws(() =>
    googleConfiguration({
      ...base,
      NODE_ENV: 'production',
      PUBLIC_ORIGIN: 'https://shop.test',
    }),
  );
  assert.throws(() =>
    googleConfiguration({
      ...base,
      GOOGLE_REDIRECT_URI: 'https://shop.test/other',
    }),
  );
  assert.throws(() =>
    googleConfiguration({
      ...base,
      NODE_ENV: 'production',
      PUBLIC_ORIGIN: 'https://shop.test',
      GOOGLE_REDIRECT_URI: 'https://other.test/api/auth/google/callback',
    }),
  );
});
async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spl-google-'));
  const staticDirectory = path.join(dir, 'public');
  fs.mkdirSync(staticDirectory);
  fs.writeFileSync(path.join(staticDirectory, 'index.html'), 'SPL customer');
  const config = {
    clientId,
    clientSecret: 'mock-private-secret',
    redirectUri: 'https://shop.test/api/auth/google/callback',
  };
  const codes = new Map();
  let requests = 0;
  const app = createBackend({
    databasePath: path.join(dir, 'db.sqlite'),
    staticDirectory,
    uploadDirectory: path.join(dir, 'uploads'),
    allowedOrigins: ['https://shop.test'],
    secureCookies: true,
    google: config,
    googleTransport: {
      fetchImpl: async (url, options) => {
        if (url === 'https://www.googleapis.com/oauth2/v3/certs')
          return Response.json({ keys: [key] });
        assert.equal(url, 'https://oauth2.googleapis.com/token');
        requests++;
        const params = new URLSearchParams(options.body);
        assert.equal(params.get('client_secret'), config.clientSecret);
        assert.equal(params.get('redirect_uri'), config.redirectUri);
        const saved = codes.get(params.get('code'));
        assert.ok(saved);
        assert.equal(
          createHash('sha256')
            .update(params.get('code_verifier'))
            .digest('base64url'),
          saved.challenge,
        );
        return Response.json({ id_token: jwt(claims(saved.claims)) });
      },
    },
  });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  t.after(async () => {
    app.server.closeAllConnections();
    await new Promise((r) => app.server.close(r));
    app.store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const request = (route, options = {}) =>
    fetch(base + route, { redirect: 'manual', ...options });
  const cookie = (res, name = 'spl_session') =>
    res.headers
      .getSetCookie()
      .find((v) => v.startsWith(name + '='))
      ?.split(';')[0];
  async function start(
    audience = 'customer',
    setupCode = null,
    returnTo = '/',
  ) {
    const options = setupCode
      ? {
          method: 'POST',
          headers: {
            Origin: 'https://shop.test',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ audience, setupCode }),
        }
      : {};
    const res = await request(
      '/api/auth/google/start?audience=' +
        audience +
        '&returnTo=' +
        encodeURIComponent(returnTo),
      options,
    );
    if (res.status !== 200 && res.status !== 302) return { res };
    const url = new URL(
      setupCode ? (await res.json()).url : res.headers.get('location'),
    );
    assert.equal(url.origin, 'https://accounts.google.com');
    assert.equal(url.searchParams.get('scope'), 'openid email profile');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    const code = randomBytes(16).toString('hex');
    codes.set(code, {
      challenge: url.searchParams.get('code_challenge'),
      claims: claims({ nonce: url.searchParams.get('nonce') }),
    });
    return {
      res,
      url,
      code,
      cookie: cookie(res, 'spl_google'),
      state: url.searchParams.get('state'),
    };
  }
  async function finish(flow, identity = {}, extraCookie = '') {
    codes.get(flow.code).claims = {
      ...codes.get(flow.code).claims,
      ...identity,
    };
    return request(
      '/api/auth/google/callback?' +
        new URLSearchParams({ state: flow.state, code: flow.code }),
      { headers: { Cookie: flow.cookie + '; ' + extraCookie } },
    );
  }
  async function session(res) {
    return (
      await request('/api/auth/session', { headers: { Cookie: cookie(res) } })
    ).json();
  }
  return {
    ...app,
    config,
    request,
    start,
    finish,
    session,
    cookie,
    get requests() {
      return requests;
    },
  };
}
test('Google signup and repeated sign-in preserve accounts with secure sessions', async (t) => {
  const f = await fixture(t);
  let flow = await f.start();
  let res = await f.finish(flow);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/');
  const auth = await f.session(res);
  assert.equal(auth.user.role, 'customer');
  const customerCookie = f.cookie(res);
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax'])
    assert.match(res.headers.getSetCookie().join(';'), new RegExp(attribute));
  assert.equal(
    (await f.request('/api/catalog', { headers: { Cookie: customerCookie } }))
      .status,
    200,
  );
  flow = await f.start();
  res = await f.finish(flow);
  assert.equal((await f.session(res)).user.id, auth.user.id);
  assert.equal(
    (
      await f.request('/api/owner/orders', {
        headers: { Cookie: f.cookie(res) },
      })
    ).status,
    403,
  );
});
test('First owner setup requires private authorization and permits exactly one chosen Google account', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.start('owner')).res.status, 403);
  const code = f.store.createOwnerSetup();
  assert.equal((await f.start('owner', 'wrong-code')).res.status, 403);
  const flow = await f.start('owner', code);
  const res = await f.finish(flow, {
    email: 'any.chosen.account@gmail.com',
    sub: 'chosen-owner',
  });
  assert.equal(res.headers.get('location'), '/owner/');
  assert.equal((await f.session(res)).user.role, 'owner');
  assert.equal(
    (
      await f.request('/api/owner/orders', {
        headers: { Cookie: f.cookie(res) },
      })
    ).status,
    200,
  );
  const different = await f.start('owner');
  const denied = await f.finish(different, {
    email: 'other@gmail.com',
    sub: 'different-owner',
  });
  assert.match(denied.headers.get('location'), /authError=/);
  assert.equal((await f.session(denied)).user, null);
  const again = await f.start('owner');
  const allowed = await f.finish(again, {
    email: 'renamed@gmail.com',
    sub: 'chosen-owner',
  });
  assert.equal((await f.session(allowed)).user.role, 'owner');
  assert.equal(
    f.store.db
      .prepare("SELECT COUNT(*) AS n FROM users WHERE role='owner'")
      .get().n,
    1,
  );
  assert.throws(() => f.store.createOwnerSetup());
  assert.throws(() => f.store.validateOwnerSetup(code));
});
test('Competing setup callbacks cannot create a second owner and expired codes are rejected', async (t) => {
  const f = await fixture(t);
  const expired = f.store.createOwnerSetup();
  f.store.db.prepare('UPDATE owner_setup SET expires_at=0').run();
  assert.equal((await f.start('owner', expired)).res.status, 403);
  const code = f.store.createOwnerSetup();
  const first = await f.start('owner', code);
  const second = await f.start('owner', code);
  const [a, b] = await Promise.all([
    f.finish(first, { email: 'first@gmail.com', sub: 'first-owner' }),
    f.finish(second, { email: 'second@gmail.com', sub: 'second-owner' }),
  ]);
  assert.equal(
    [a, b].filter((r) => r.headers.get('location') === '/owner/').length,
    1,
  );
  assert.equal(
    f.store.db
      .prepare("SELECT COUNT(*) AS n FROM users WHERE role='owner'")
      .get().n,
    1,
  );
  const payload = await (await f.request('/api/auth/google/config')).json();
  assert.equal(payload.ownerSetupRequired, false);
  assert.ok(!JSON.stringify(payload).includes(code));
  assert.ok(!JSON.stringify(payload).includes('@gmail.com'));
});
test('Private owner replacement revokes old owner access and selects a new single account', async (t) => {
  const f = await fixture(t);
  let code = f.store.createOwnerSetup();
  let flow = await f.start('owner', code);
  const old = await f.finish(flow, {
    email: 'old@gmail.com',
    sub: 'old-owner',
  });
  const oldId = (await f.session(old)).user.id;
  code = f.store.createOwnerSetup(true);
  assert.equal((await f.session(old)).user, null);
  flow = await f.start('owner', code);
  const replacement = await f.finish(flow, {
    email: 'new@gmail.com',
    sub: 'new-owner',
  });
  assert.equal((await f.session(replacement)).user.role, 'owner');
  flow = await f.start('owner');
  const denied = await f.finish(flow, {
    email: 'old@gmail.com',
    sub: 'old-owner',
  });
  assert.match(denied.headers.get('location'), /authError=/);
  assert.equal(
    f.store.db.prepare('SELECT role FROM users WHERE id=?').get(oldId).role,
    'customer',
  );
  assert.equal(f.store.catalog().length, 8);
});
test('OAuth state is browser-bound, expiring, single-use and protected by PKCE', async (t) => {
  const f = await fixture(t);
  const flow = await f.start();
  const res = await f.request(
    '/api/auth/google/callback?' +
      new URLSearchParams({ state: flow.state, code: flow.code }),
    { headers: { Cookie: 'spl_google=another-browser' } },
  );
  assert.match(res.headers.get('location'), /authError=/);
  assert.equal(f.requests, 0);
  assert.equal((await f.finish(flow)).headers.get('location'), '/');
  assert.match((await f.finish(flow)).headers.get('location'), /authError=/);
  assert.equal(f.requests, 1);
  const expired = await f.start();
  f.store.db.prepare('UPDATE google_flows SET expires_at=0').run();
  assert.match((await f.finish(expired)).headers.get('location'), /authError=/);
  assert.equal(f.requests, 1);
  const cancelled = await f.start();
  await f.request(
    '/api/auth/google/callback?' +
      new URLSearchParams({ state: cancelled.state, error: 'access_denied' }),
    { headers: { Cookie: cancelled.cookie } },
  );
  assert.match(
    (await f.finish(cancelled)).headers.get('location'),
    /authError=/,
  );
});
test('Legacy customers require private migration approval and cannot request owner privileges', async (t) => {
  const f = await fixture(t);
  const password = randomBytes(24).toString('hex');
  const existing = f.store.createUser({
    email: 'customer@gmail.com',
    name: 'Existing customer',
    password,
  });
  let flow = await f.start();
  let res = await f.finish(flow);
  assert.match(res.headers.get('location'), /authError=/);
  assert.equal(
    f.store.db.prepare('SELECT COUNT(*) AS n FROM google_identities').get().n,
    0,
  );
  for (const endpoint of [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/google/link',
  ])
    assert.equal(
      (
        await f.request(endpoint, {
          method: 'POST',
          headers: {
            Origin: 'https://shop.test',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: existing.email,
            password,
            role: 'owner',
          }),
        })
      ).status,
      410,
    );
  f.store.authorizeGoogleMigration(existing.email);
  flow = await f.start();
  res = await f.finish(flow);
  const migrated = await f.session(res);
  assert.equal(migrated.user.id, existing.id);
  assert.equal(migrated.user.role, 'customer');
  assert.equal(
    (
      await f.request('/api/owner/orders', {
        headers: { Cookie: f.cookie(res) },
      })
    ).status,
    403,
  );
  assert.equal(
    f.store.db
      .prepare('SELECT COUNT(*) AS n FROM pending_google_migrations')
      .get().n,
    0,
  );
});
test('v3 database upgrade preserves existing users and password sessions', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { createStore, digest } = await import('../server/store.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spl-google-upgrade-'));
  const filename = path.join(dir, 'legacy.sqlite');
  const old = new DatabaseSync(filename);
  const token = randomBytes(32).toString('hex');
  old.exec(`CREATE TABLE users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL);
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);`);
  old
    .prepare('INSERT INTO users VALUES(?,?,?,?,?)')
    .run(
      'legacy-user',
      'legacy@gmail.com',
      'Existing customer',
      'customer',
      'existing-password-hash',
    );
  old
    .prepare('INSERT INTO sessions VALUES(?,?,?,?)')
    .run(digest(token), 'legacy-user', 'existing-csrf', Date.now() + 60_000);
  old.close();
  const store = createStore(filename);
  try {
    assert.equal(store.session(token).user.id, 'legacy-user');
    assert.equal(store.session(token).provider, 'password');
    assert.equal(
      store.db
        .prepare('SELECT password_hash FROM users WHERE id=?')
        .get('legacy-user').password_hash,
      'existing-password-hash',
    );
    const googleSession = store.newSession('legacy-user', 'google');
    assert.equal(store.session(googleSession.token).provider, 'google');
    assert.equal(
      store.db.prepare('SELECT COUNT(*) AS n FROM google_identities').get().n,
      0,
    );
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Checkout and order-account sign-ins return only to allowed local destinations', async (t) => {
  const f = await fixture(t);
  let flow = await f.start('customer', null, '/?checkout=1');
  let res = await f.finish(flow);
  assert.equal(res.headers.get('location'), '/?checkout=1');
  flow = await f.start('customer', null, '/account/');
  res = await f.finish(flow);
  assert.equal(res.headers.get('location'), '/account/');
  for (const redirect of [
    'https://attacker.test/',
    '//attacker.test/',
    '/owner/',
    '/?checkout=1&redirect=https://attacker.test/',
  ])
    assert.equal((await f.start('customer', null, redirect)).res.status, 400);
});

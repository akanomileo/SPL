import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createRequestId,
  normalizePhone,
  validateDelivery,
} from '../lib/storefront.ts';
import {
  validateSiteUrl,
  writeDiscoveryFiles,
} from '../scripts/site-config.mjs';

test('Myanmar and mixed phone digits validate and letters remain invalid', () => {
  const delivery = {
    name: 'Test Customer',
    address: 'Example Street, Yangon',
    note: '',
  };
  for (const phone of ['၀၉၇၉၇၀၉၇၇၇၈', '+၉၅ (9) 797-097778'])
    assert.deepEqual(validateDelivery({ ...delivery, phone }), {});
  assert.equal(normalizePhone('၀၁၂၃၄၅၆၇၈၉'), '0123456789');
  assert.ok(validateDelivery({ ...delivery, phone: '၀၉abc၇၉၇၇၇၈' }).phone);
});

test('request references work without randomUUID and fail explicitly without secure randomness', () => {
  const provider = {
    getRandomValues: (bytes) => crypto.getRandomValues(bytes),
  };
  const first = createRequestId(provider);
  const second = createRequestId(provider);
  assert.match(
    first,
    /^SPL-[A-F0-9]{8}-[A-F0-9]{4}-4[A-F0-9]{3}-[89AB][A-F0-9]{3}-[A-F0-9]{12}$/,
  );
  assert.notEqual(first, second);
  assert.throws(() => createRequestId({}), /unavailable/);
});

test('deployment URL rejects example, insecure and mismatched-path configuration', () => {
  assert.equal(validateSiteUrl(''), '');
  assert.equal(
    validateSiteUrl('https://spl.test/shop/', '/shop'),
    'https://spl.test/shop',
  );
  for (const url of [
    'https://example.com',
    'http://spl.test',
    'https://name:secret@spl.test',
    'https://spl.test?x=1',
    'https://spl.test#page',
    'https://spl.test/shop',
  ])
    assert.throws(() => validateSiteUrl(url));
});

test('discovery output uses the real configured URL and removes stale sitemap for portable builds', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spl-site-'));
  try {
    writeDiscoveryFiles(dir, 'https://spl.test/shop');
    assert.match(
      fs.readFileSync(path.join(dir, 'sitemap.xml'), 'utf8'),
      /<loc>https:\/\/spl.test\/shop\/<\/loc>/,
    );
    assert.match(
      fs.readFileSync(path.join(dir, 'robots.txt'), 'utf8'),
      /Sitemap: https:\/\/spl.test\/shop\/sitemap.xml/,
    );
    writeDiscoveryFiles(dir);
    assert.equal(fs.existsSync(path.join(dir, 'sitemap.xml')), false);
    assert.doesNotMatch(
      fs.readFileSync(path.join(dir, 'robots.txt'), 'utf8'),
      /Sitemap:/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

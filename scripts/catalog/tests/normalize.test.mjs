import test from 'node:test';
import assert from 'node:assert/strict';
import { isSentinel, normalizeToNull, normalizeToArray, normalizeBool } from '../lib/normalize.mjs';

test('sentinel normalization basics', () => {
  assert.equal(isSentinel('Not specified'), true);
  assert.equal(isSentinel('  '), true);
  assert.equal(normalizeToNull('N/A'), null);
  assert.deepEqual(normalizeToArray('Full sun, Partial Shade'), ['full sun', 'partial shade']);
  assert.equal(normalizeBool('true'), true);
  assert.equal(normalizeBool('False'), false);
});

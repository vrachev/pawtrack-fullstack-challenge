import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, resetStore } from './helpers.js';

beforeEach(resetStore);

test('GET /api/bookings ignores ?tenantId= for non-admin callers', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/bookings?tenantId=tenant_seattle&limit=50',
    headers: { 'x-user-id': 'sitter_001' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.total, 10, 'sitter in Portland must see only Portland bookings');
  for (const b of body.data) {
    assert.equal(b.tenantId, 'tenant_portland');
  }
});

test('GET /api/bookings honors ?tenantId= for admin callers', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/bookings?tenantId=tenant_seattle&limit=50',
    headers: { 'x-user-id': 'user_admin_portland' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.total, 5, 'admin override should surface Seattle bookings');
  for (const b of body.data) {
    assert.equal(b.tenantId, 'tenant_seattle');
  }
});

test('GET /api/bookings without override returns the caller tenant', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/bookings?limit=50',
    headers: { 'x-user-id': 'sitter_001' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.total, 10);
  for (const b of body.data) {
    assert.equal(b.tenantId, 'tenant_portland');
  }
});

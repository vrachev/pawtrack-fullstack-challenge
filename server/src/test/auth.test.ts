import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, resetStore } from './helpers.js';

beforeEach(resetStore);

test('GET /api/me rejects a forged role header: sitter_001 cannot claim admin', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/me',
    headers: {
      'x-user-id': 'sitter_001',
      'x-tenant-id': 'tenant_portland',
      'x-user-role': 'admin',
    },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.userId, 'sitter_001');
  assert.equal(body.role, 'sitter', 'role must come from the user record, not the header');
});

test('GET /api/me rejects a forged tenant header: sitter_001 cannot claim Seattle', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/me',
    headers: {
      'x-user-id': 'sitter_001',
      'x-tenant-id': 'tenant_seattle',
    },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.tenantId, 'tenant_portland', 'tenantId must come from the user record');
});

test('GET /api/me with missing X-User-Id returns 401', async () => {
  const app = buildTestApp();
  const res = await app.inject({ method: 'GET', url: '/api/me', headers: {} });
  assert.equal(res.statusCode, 401);
});

test('GET /api/me with unknown X-User-Id returns 401', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/me',
    headers: { 'x-user-id': 'nobody_here' },
  });
  assert.equal(res.statusCode, 401);
});

test('GET /api/me works with only X-User-Id: tenant and role derived from the user', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/me',
    headers: { 'x-user-id': 'sitter_001' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.userId, 'sitter_001');
  assert.equal(body.tenantId, 'tenant_portland');
  assert.equal(body.role, 'sitter');
});

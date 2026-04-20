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

test('GET /api/bookings/:id returns 404 when booking belongs to another tenant', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/bookings/booking_007',
    headers: { 'x-user-id': 'sitter_001' },
  });
  assert.equal(res.statusCode, 404);
  const body = res.json();
  assert.equal(body.error, 'Booking not found');
  assert.equal(body.data, undefined, 'cross-tenant booking must not leak through');
});

test('GET /api/bookings/:id returns 404 when booking id does not exist', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/bookings/nope',
    headers: { 'x-user-id': 'sitter_001' },
  });
  assert.equal(res.statusCode, 404);
  const body = res.json();
  assert.equal(body.error, 'Booking not found');
});

test('GET /api/bookings/:id returns 200 for a same-tenant booking', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/bookings/booking_001',
    headers: { 'x-user-id': 'sitter_001' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.data.id, 'booking_001');
  assert.equal(body.data.tenantId, 'tenant_portland');
});

test('GET /api/bookings/:id lets an admin fetch a cross-tenant booking', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/bookings/booking_007',
    headers: { 'x-user-id': 'user_admin_portland' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.data.id, 'booking_007');
  assert.equal(body.data.tenantId, 'tenant_seattle');
});

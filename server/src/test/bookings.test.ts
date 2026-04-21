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

test('PATCH /api/bookings/:id/status rejects cross-tenant writes and leaves the store unchanged', async () => {
  const app = buildTestApp();
  const patchRes = await app.inject({
    method: 'PATCH',
    url: '/api/bookings/booking_007/status',
    headers: { 'x-user-id': 'sitter_001' },
    payload: { status: 'in_progress' },
  });
  assert.equal(patchRes.statusCode, 404);
  assert.equal(patchRes.json().error, 'Booking not found');

  const getRes = await app.inject({
    method: 'GET',
    url: '/api/bookings/booking_007',
    headers: { 'x-user-id': 'user_admin_portland' },
  });
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.json().data.status, 'confirmed', 'cross-tenant PATCH must not mutate the booking');
});

test('PATCH /api/bookings/:id/status returns 404 for a missing booking', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'PATCH',
    url: '/api/bookings/nope/status',
    headers: { 'x-user-id': 'sitter_001' },
    payload: { status: 'confirmed' },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, 'Booking not found');
});

test('PATCH /api/bookings/:id/status succeeds for a same-tenant caller', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'PATCH',
    url: '/api/bookings/booking_002/status',
    headers: { 'x-user-id': 'user_admin_portland' },
    payload: { status: 'confirmed' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.success, true);
  assert.equal(body.booking.status, 'confirmed');
});

test('PATCH /api/bookings/:id/status lets an admin update a cross-tenant booking', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'PATCH',
    url: '/api/bookings/booking_007/status',
    headers: { 'x-user-id': 'user_admin_portland' },
    payload: { status: 'in_progress' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.success, true);
  assert.equal(body.booking.id, 'booking_007');
  assert.equal(body.booking.status, 'in_progress');
});

test('POST /api/bookings rejects a cross-tenant petId and creates no booking', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    headers: { 'x-user-id': 'user_staff_portland' },
    payload: {
      petId: 'pet_006',
      sitterId: 'sitter_001',
      scheduledDate: '2027-01-15T14:00:00-08:00',
      startTime: '14:00',
      endTime: '15:00',
      notes: '',
    },
  });
  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body.success, false);
  assert.match(body.error, /pet|sitter|tenant/i);

  const listRes = await app.inject({
    method: 'GET',
    url: '/api/bookings?limit=50',
    headers: { 'x-user-id': 'user_admin_portland' },
  });
  assert.equal(listRes.json().total, 10, 'denied POST must not create a booking');
});

test('POST /api/bookings rejects a cross-tenant sitterId and creates no booking', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    headers: { 'x-user-id': 'user_staff_portland' },
    payload: {
      petId: 'pet_001',
      sitterId: 'sitter_003',
      scheduledDate: '2027-01-15T14:00:00-08:00',
      startTime: '14:00',
      endTime: '15:00',
      notes: '',
    },
  });
  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body.success, false);
  assert.match(body.error, /pet|sitter|tenant/i);

  const listRes = await app.inject({
    method: 'GET',
    url: '/api/bookings?limit=50',
    headers: { 'x-user-id': 'user_admin_portland' },
  });
  assert.equal(listRes.json().total, 10, 'denied POST must not create a booking');
});

test('GET /api/bookings?date filters by tenant-local day (late-night UTC booking)', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/bookings?date=2026-04-08&limit=50',
    headers: { 'x-user-id': 'user_admin_portland' },
  });
  assert.equal(res.statusCode, 200);
  const ids = res.json().data.map((b: { id: string }) => b.id);
  assert.ok(
    ids.includes('booking_006'),
    'booking_006 at 2026-04-09T06:30:00Z is 2026-04-08 23:30 in Portland and must match date=2026-04-08',
  );
});

test('GET /api/bookings?date excludes bookings whose UTC day matches but tenant-local day does not', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/bookings?date=2026-04-09&limit=50',
    headers: { 'x-user-id': 'user_admin_portland' },
  });
  assert.equal(res.statusCode, 200);
  const ids = res.json().data.map((b: { id: string }) => b.id);
  assert.ok(
    !ids.includes('booking_006'),
    'booking_006 is April 8 in Portland — date=2026-04-09 must not include it',
  );
});

test('POST /api/bookings succeeds for same-tenant pet and sitter', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/bookings',
    headers: { 'x-user-id': 'user_staff_portland' },
    payload: {
      petId: 'pet_001',
      sitterId: 'sitter_002',
      scheduledDate: '2027-01-15T14:00:00-08:00',
      startTime: '14:00',
      endTime: '15:00',
      notes: '',
    },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.success, true);
  assert.equal(body.data.tenantId, 'tenant_portland');
  assert.equal(body.data.petId, 'pet_001');
  assert.equal(body.data.sitterId, 'sitter_002');
});

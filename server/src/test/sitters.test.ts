import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, resetStore } from './helpers.js';

beforeEach(resetStore);

// Portland seed:
//   sitter_001 "Maria Chen"  busy 2026-04-10 09:00-11:00 (booking_001, confirmed)
//   sitter_002 "Jake Wilson" busy 2026-04-08 23:30 → 2026-04-09 00:30 (booking_006, confirmed, wraps midnight)

test('GET /api/sitters/available returns only sitters with no overlapping booking', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/sitters/available?scheduledDate=2026-04-10T09:00:00-07:00&startTime=09:00&endTime=10:00',
    headers: { 'x-user-id': 'user_staff_portland' },
  });
  assert.equal(res.statusCode, 200);
  const ids = res.json().data.map((s: { id: string }) => s.id);
  assert.deepEqual(ids, ['sitter_002'], 'sitter_001 is busy 09:00-11:00; only sitter_002 should be free');
});

test('GET /api/sitters/available returns both sitters when neither overlaps', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/sitters/available?scheduledDate=2026-04-10T14:00:00-07:00&startTime=14:00&endTime=15:00',
    headers: { 'x-user-id': 'user_staff_portland' },
  });
  assert.equal(res.statusCode, 200);
  const ids = res.json().data.map((s: { id: string }) => s.id);
  assert.deepEqual(ids, ['sitter_002', 'sitter_001'], 'alphabetical by name: Jake Wilson < Maria Chen');
});

test('GET /api/sitters/available ignores cancelled bookings', async () => {
  // booking_016 is sitter_006 cancelled 2026-04-06 14:00-16:00 in Austin.
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/sitters/available?scheduledDate=2026-04-06T14:00:00-05:00&startTime=14:00&endTime=16:00',
    headers: { 'x-user-id': 'user_staff_austin' },
  });
  assert.equal(res.statusCode, 200);
  const ids = res.json().data.map((s: { id: string }) => s.id);
  assert.ok(ids.includes('sitter_006'), 'cancelled booking must not block availability');
});

test('GET /api/sitters/available detects midnight-wrap overlap', async () => {
  // booking_006 (sitter_002) starts 2026-04-08 23:30 PT and wraps to 2026-04-09 00:30 PT.
  // Requesting 2026-04-09 00:00-00:30 PT must overlap that wrap.
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/sitters/available?scheduledDate=2026-04-09T00:00:00-07:00&startTime=00:00&endTime=00:30',
    headers: { 'x-user-id': 'user_staff_portland' },
  });
  assert.equal(res.statusCode, 200);
  const ids = res.json().data.map((s: { id: string }) => s.id);
  assert.ok(!ids.includes('sitter_002'), 'sitter_002 is busy on the far side of midnight');
  assert.ok(ids.includes('sitter_001'), 'sitter_001 has no Apr 9 bookings in seed data');
});

test('GET /api/sitters/available enforces tenant isolation for non-admin callers', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/sitters/available?tenantId=tenant_seattle&scheduledDate=2027-05-01T14:00:00-07:00&startTime=14:00&endTime=15:00',
    headers: { 'x-user-id': 'user_staff_portland' },
  });
  assert.equal(res.statusCode, 200);
  const tenantIds = res.json().data.map((s: { tenantId: string }) => s.tenantId);
  assert.ok(
    tenantIds.every((t: string) => t === 'tenant_portland'),
    'non-admin tenantId override must be ignored',
  );
});

test('GET /api/sitters/available honors ?tenantId= for admin callers', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/sitters/available?tenantId=tenant_seattle&scheduledDate=2027-05-01T14:00:00-07:00&startTime=14:00&endTime=15:00',
    headers: { 'x-user-id': 'user_admin_portland' },
  });
  assert.equal(res.statusCode, 200);
  const data = res.json().data as { id: string; tenantId: string }[];
  assert.equal(data.length, 2);
  assert.ok(data.every(s => s.tenantId === 'tenant_seattle'));
  assert.deepEqual(data.map(s => s.id), ['sitter_003', 'sitter_004'], 'Aisha Patel < Tom Nguyen');
});

test('GET /api/sitters/available sorts sitters alphabetically by name', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/sitters/available?scheduledDate=2027-05-01T14:00:00-05:00&startTime=14:00&endTime=15:00',
    headers: { 'x-user-id': 'user_staff_austin' },
  });
  assert.equal(res.statusCode, 200);
  const names = res.json().data.map((s: { name: string }) => s.name);
  assert.deepEqual(names, ['Dev Sharma', 'Rosa Garcia']);
});

test('GET /api/sitters/available rejects invalid params with 400', async () => {
  const app = buildTestApp();

  const missing = await app.inject({
    method: 'GET',
    url: '/api/sitters/available?startTime=14:00&endTime=15:00',
    headers: { 'x-user-id': 'user_staff_portland' },
  });
  assert.equal(missing.statusCode, 400);
  assert.match(missing.json().error, /scheduledDate/);

  const badTime = await app.inject({
    method: 'GET',
    url: '/api/sitters/available?scheduledDate=2027-05-01T14:00:00-07:00&startTime=25:00&endTime=15:00',
    headers: { 'x-user-id': 'user_staff_portland' },
  });
  assert.equal(badTime.statusCode, 400);
  assert.match(badTime.json().error, /startTime/);

  const badDate = await app.inject({
    method: 'GET',
    url: '/api/sitters/available?scheduledDate=not-a-date&startTime=14:00&endTime=15:00',
    headers: { 'x-user-id': 'user_staff_portland' },
  });
  assert.equal(badDate.statusCode, 400);
  assert.match(badDate.json().error, /scheduledDate/);
});

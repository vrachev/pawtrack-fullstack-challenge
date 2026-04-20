# PawTrack Audit — Findings from Claude

### Note - unverified by a human. Check DECISIONS.md for verified issues.

A pass through the codebase. Severity in brackets, ranked Critical → Low. File/route names inline; grep from there if you want the exact spot.

- [Critical] GET /api/bookings reads `tenantId = query.tenantId || auth.tenantId` with just a comment about "admin views" — no actual role check. Any authenticated user can pass `?tenantId=tenant_seattle` and read another tenant's bookings. This is the most likely source of the "customer saw another customer's bookings" bug.
- [Critical] GET /api/bookings/:id doesn't check tenant ownership. Anyone with valid auth headers can fetch any booking across tenants by ID. The pets route gets this right; bookings missed it.
- [Critical] PATCH /api/bookings/:id/status has no tenant check and no role check. A staff user in Portland can cancel or complete Seattle's bookings.
- [Critical] POST /api/bookings takes `petId` and `sitterId` from the request body and writes them to a new booking without verifying they belong to the caller's tenant. A Portland user can create bookings referencing Seattle pets or sitters.
- [Critical] The auth middleware trusts `X-User-Role` from the client — anyone can send `X-User-Role: admin`. No endpoint checks role today, but this is a footgun for any future RBAC code.
- [Critical] `userId` comes straight from a header with no lookup or validation. Audit fields like `statusChangedBy` and `createdBy` end up recording arbitrary strings.
- [Critical] Double-booking race in `createBooking`. The code reads all bookings, checks overlap, awaits a 10ms sleep (!), then writes — two concurrent requests can both pass the check and both write. This is the README's double-booking bug. The fix needs a lock, a unique constraint on (sitterId, time-range), or a transactional check-and-insert.
- [Critical] The overlap check is broken for bookings that cross midnight. It builds `existingStart` and `existingEnd` from the same date string, so for booking_006 (23:30 → 00:30) `existingEnd` ends up before `existingStart` and the comparison is effectively always false. Midnight-spanning bookings bypass overlap detection entirely.
- [Critical] The overlap check loses timezone. `scheduledDate.split('T')[0]` strips the offset and the resulting `new Date('YYYY-MM-DDTHH:MM')` is parsed in the server's local TZ. Bookings in different zones get compared as if they were in the same one — and PawTrack runs Portland/Seattle/Austin (Pacific and Central).
- [Critical] Status updates aren't transactional. Two concurrent PATCHes can both pass `confirmed → in_progress`, or one can pass `requested → confirmed` while another passes `requested → cancelled` with last-write-wins. Needs a version/etag or status-conditional update.
- [Critical] Off-by-one pagination — `offset = page * limit` with 1-based page numbers. Page 1 returns rows 6–10 instead of 1–5; page 2 is empty. The first page of bookings is invisible. This is why Seattle/Austin appeared to have zero bookings when I signed in.
- [Critical] Stale-response race on the client. Polling fires every 15 seconds and filter changes fire their own fetches — no request ID, no AbortController. A slow polling response can arrive after a fast filter-change response and overwrite the screen with the previous filters' data. This is the "filters reset randomly" bug; polling just amplifies how often you hit it.
- [High] Pagination params aren't validated. Non-numeric `page` becomes `NaN` and silently returns nothing. No max on `limit` (send `limit=999999999` to dump the table). No floor on `page` — negative values produce negative offsets, which `.slice()` interprets as "last N".
- [High] XSS via booking notes. The dashboard renders notes with `innerHTML`, and `notes` is user-submitted via the create form. Seed booking_005 already has `<b>` rendering as bold; `<img src=x onerror=alert(1)>` would pop on every dashboard load for every user (stored XSS).
- [High] The rest of the fields in that same template (`id`, `petId`, `sitterId`, `startTime`, `endTime`, `status`) are also interpolated as raw HTML. Server-controlled today, but if any becomes free-text later it's instantly XSS. The whole render should switch to `textContent` / DOM construction.
- [High] There's also an XSS payload sitting dormant in seed data — `pet_005`'s notes contain `<img src=x onerror="alert(1)">`. Harmless right now because the dashboard never renders pet notes, but it's a landmine for whoever adds a pet view.
- [High] Polling keeps running while the edit modal is open, and while the tab is hidden. Mid-edit responses can wipe the dashboard under the modal, and we waste load on hidden tabs.
- [High] The date filter is a string-prefix match on UTC — `scheduledDate.startsWith(date)`. booking_006 is stored as `2026-04-09T06:30:00Z` (April 8 23:30 PT); filtering for "2026-04-08" misses it and filtering for "2026-04-09" returns it wrongly. The seed even flags this in comments. The filter needs to interpret the date in the tenant's timezone (`Tenant.timezone` already exists).
- [High] On the client, `<input type="date">` gives `"2026-04-10"` and `new Date(...).toISOString()` parses it as UTC midnight — which in Pacific is April 9 5pm. The `startTime`/`endTime` fields don't carry a zone either, so the server has nothing to reconcile with. Combined with the point above, scheduled dates drift across day boundaries.
- [High] Render uses `new Date(scheduledDate).toLocaleDateString()`, which renders in the browser's local TZ. A Portland-tenant booking viewed by an Austin staff member shows Austin's date.
- [Medium] The overlap check scans `getAllBookings()` — cross-tenant. It's correct today because sitter IDs are globally unique, but it's a leaky abstraction. Should be `getBookingsBySitter(sitterId)`.
- [Medium] Wrong HTTP status codes everywhere in the bookings routes. 200 with `{error}` for not-found instead of 404; 200 for create success instead of 201; 200 for create/update failures instead of 400/409/422. This breaks fetch-based error handling, monitoring, retries, CDNs, and gateways. Auth middleware uses 401 for missing headers, which is fine, though 403 is arguably more accurate when auth is valid but the tenant is not.
- [Medium] No request body validation on booking routes. Bodies are cast via `as { ... }` with no runtime check — missing fields, wrong types, empty strings, oversize payloads all flow through. Fastify supports JSON Schema on routes and we're not using any.
- [Medium] `status` isn't validated as an enum. A request with `status="banana"` passes the type assertion, hits `VALID_TRANSITIONS[booking.status]`, and produces a confusing "Cannot transition from 'requested' to 'banana'" error. Reject upfront.
- [Medium] No content-type enforcement on write endpoints.
- [Medium] CORS is set to `origin: true`, which echoes any request's Origin back. Combined with header-bearing requests this is the most permissive setting possible. Should be an allowlist.
- [Medium] No rate limiting anywhere.
- [Medium] The bookings routes leak `error.message` directly to clients. Internal exceptions surface verbatim.
- [Medium] No status-change history. `updateStatus` overwrites `statusChangedAt` and `statusChangedBy` in place (the code has a literal "no history kept" comment). For a booking system, who-cancelled-when matters for disputes. The event emitter could persist these events instead of just `console.log`'ing them.
- [Medium] The event emitter swallows the rest of the handlers if one throws — it loops with no try/catch. Also no async support (promises aren't awaited) and no off/unsubscribe (memory leak risk).
- [Medium] The overlap check is implemented inside the service by grabbing `getAllBookings()` and filtering. Should be a `store.findOverlappingBookings(sitterId, range)` method — business logic is leaking into a query the store can't optimize.
- [Medium] No abstraction over the store. `MemoryStore` is imported directly as a singleton everywhere — hard to mock, hard to swap for a real DB. No interface, no DI.
- [Medium] Bookings can be created in the past. No check on `scheduledDate`.
- [Medium] Booking duration can be zero or negative. Nothing enforces `endTime > startTime`.
- [Medium] `notes` length is unbounded — easy DoS via a giant string.
- [Medium] `startTime`/`endTime` format isn't validated server-side. The client form coerces, but anyone hitting the API with `curl` can send anything.
- [Low] There's a misleading comment in app.js claiming "the polling closure still has the old filters." That's false — `let filters` is a name lookup at call time, so the closure sees updates. The real bug is response ordering. The comment will send the next reader down the wrong rabbit hole.
- [Low] `console.log` is mixed with Fastify's structured logger. Two destinations, two formats, no correlation.
- [Low] `BookingService` is a class with no state. Could be a module of pure functions; the class adds no value without DI.
- [Low] `(request as any).auth` shows up in routes. Loses type safety. Should augment `FastifyRequest` via module declaration.
- [Low] `uuid().slice(0, 8)` is used for booking IDs — that's ~32 bits, and collisions become likely around ~65k bookings (birthday paradox). Use the full UUID or a sequential ID.
- [Low] Inline `onclick="goToPage(${page-1})"` in the pagination template. Today `page` is always an integer so it isn't exploitable, but it breaks CSP and is the wrong pattern.
- [Low] The create modal can be opened before pets/sitters load — empty dropdowns, no error.
- [Low] No loading state on modal submit. Double-click creates two bookings.
- [Low] No confirmation on cancel or other destructive transitions. One click cancels.
- [Low] Single hardcoded toast element. Each new toast replaces the prior one, so rapid actions lose messages.
- [Low] The client displays errors by reading `result.error` off a 200 response. If the server is mid-deploy and returns HTML or a non-JSON 500, fetch doesn't enter `catch` and the UI shows nothing.
- [Low] Status-action buttons don't disable while a transition is in flight.
- [Low] `tenant-info` is hardcoded text. Fine for demo; flag for production.
- [Low] `package.json`'s `dev:client` uses `npx serve --cors`. Works, but pinning the version avoids surprises.
- [Low] The server listens on `0.0.0.0`, which exposes it on the LAN. Fine for local dev — just worth documenting.
- [Low] `tsconfig` has `declaration: true` for an app. Generates `.d.ts` files for nothing. Cosmetic.
- [Low] Auth is applied via `request.url.startsWith('/api/')`. Works, but Fastify's `prefix` plugin would be cleaner and avoid the "auth-on-everything-but-health" trap.

---

## Mapping back to README symptoms

| Symptom | Root cause |
|---|---|
| "Customer saw another customer's bookings" | Tenant scoping bypass on list/get/patch (first three criticals above) |
| "Double-booking last week" | TOCTOU race, plus the midnight-wrap and timezone bugs in the overlap check |
| "Filters reset randomly" | Stale-response race, amplified by polling-while-modal-open and the pagination off-by-one making the list look wrong even when filters are correct |

## Recommended fix order

1. Tenant scoping on all booking endpoints — biggest security win, ~30 min.
2. Pagination off-by-one — one line, ends user confusion.
3. XSS via notes — switch render to DOM construction.
4. Stale-response race — request token or AbortController, ignore stale responses.
5. Overlap check correctness (TOCTOU + midnight + TZ) — small redesign.

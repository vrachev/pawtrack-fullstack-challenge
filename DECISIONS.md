# Full-Stack Engineering Decisions

## Audit Findings

### The below bugs are what I found from looking through the code. I stopped after a while because there are too many, but tried to cover most of the critical ones I saw. After this, I also instruced claude to investigate the codebase and find issues. I've picked some from claude that I think are worth adding here and added them below this list. Claude's audit lives in ./investigations/CLAUDE_AUDIT.md
- [Critical] There is a race condition with booking creations. Two calls to createBooking can end up both booking the same slot with the sitter (this issue was noted in the readme).
- [✅ Critical] In the GET /api/bookings route, we allow an admin to override the tenant view, but have no check to determine if the user is actually an admin.
     * Fixed by ignoring ?tenantId= unless auth.role is 'admin'.
- [✅ Critical] In authMiddleware, any user can assign themselves an admin role, or impersonate another user by using their user-id, or sign into any tenant they want to.
     * Fixed by reading only X-User-Id and deriving tenantId/role from a new users seed looked up in the store; X-Tenant-Id and X-User-Role headers are now ignored. Added a GET /api/me route so the dashboard (and tests) can observe the real auth context.
- [✅ Critical] Off-by-one pagination bug that led to loss of the first page of bookings. This one took me a bit to figure out when I tried signing in for the Seattle/Austin tenants. This bug made them show 0 bookings since they only had one page. Bug in booking-service.ts where we set the offset to be page * limit (but page starts at 1). So the first offset becomes 5, instead of 0.
     * Fixed with by subtracting 1 from the page. Verified fix manually through UI.
- [Critical] Bookings are fetched in a ton of places in the client side app code. There can be scenariors where multiple fetch requests are being processed, and the last one that returns may not be the most recent one. I think this explains the stale bookings bug in the readme.
- [✅ Critical] In the GET /api/bookings/:id route, we don't check for tenant ownership, which is something we do in the pets API. This means someone can access any booking from across any tenant.
     * Fixed by returning 404 when the booking is missing OR when its tenantId doesn't match auth.tenantId (admins bypass). Uses the same 404 response for both cases to avoid a presence oracle. Also corrects the previous 200-on-miss status bug.
- [✅ Critical] The hasOverlap check in createBooking is incredibly brittle and broken. It strips out timezone information (b.scheduledDate.split('T')[0] just returns the date), so a user who passes in a scheduledDate with a different timezone to what is in the db will result in potential double bookings.
     * Fixed by computing each slot as (absolute start from scheduledDate) + duration derived from startTime/endTime with midnight wrap, so the overlap check uses absolute UTC timestamps. Also scoped the sitter lookup to the caller's tenant (store.getBookingsByTenant).
- [High] We display a hardcoded tenant/user on the dashboard - el.textContent = `Tenant: PawTrack Portland | User: Staff`

For this issue mentioned in the readme:
> - **A customer reported seeing another customer's bookings** in the dashboard

The language is ambiguous to me. In my understanding, a customer is a dog owner. But dog owners are not users of the dashboard, only admins, staff and sitters. 

Sitters are also customers (if we consider the product to be a 2-sided marketplace), so the bug may be referring to them. The dashboard does not filter by user-id, so all bookings are shown for the tenant, which means a sitter will see the bookings of all other sitters as well.


#### Below are issues found by Claude and validated/edited by me. I only added critical ones as there are too many issues to add and fix.
- [✅ Critical] PATCH /api/bookings/:id/status has no tenant check and no role check. A user in Portland can cancel or complete Seattle's bookings.
     * Fixed by rejecting cross-tenant PATCHes at the route layer with the same 404 response used for a missing booking (mirrors GET /:id). Admins bypass the tenant check. Side effect: PATCH against a non-existent id now returns 404 instead of 200 with {success:false}. Role-gating (who can cancel vs. who can confirm) remains out of scope.
- [Critical] Status updates aren't transactional. Two concurrent PATCHes can both pass `confirmed → in_progress`, or one can pass `requested → confirmed` while another passes `requested → cancelled` with last-write-wins. History is also overwritten, so no way to audit what happened.
- [✅ Critical] POST /api/bookings takes `petId` and `sitterId` from the request body and writes them to a new booking without verifying they belong to the caller's tenant. A Portland user can create bookings referencing Seattle pets or sitters.
     * Fixed by throwing in `bookingService.createBooking` when the pet or sitter is missing or not in the caller's tenant (single error message to avoid a presence oracle). Also changed the POST /api/bookings error catch to return 400 instead of 200 with `{success:false}`.
- [✅ Critical] The date filter is a string-prefix match on UTC — `scheduledDate.startsWith(date)`. booking_006 is stored as `2026-04-09T06:30:00Z` (April 8 23:30 PT); filtering for "2026-04-08" misses it and filtering for "2026-04-09" returns it wrongly. The seed even flags this in comments. The filter needs to interpret the date in the tenant's timezone (`Tenant.timezone` already exists).
     * Fixed by computing the filter day's UTC window in the tenant's timezone (via luxon `DateTime.fromISO(date, { zone }).startOf('day')`) and filtering by absolute timestamp. Added luxon as a dependency for robust timezone handling rather than hand-rolled `Intl.DateTimeFormat` offset math.


<!-- For each issue you find, document:
     - What the issue is and which file it's in
     - Why it matters (security risk, data integrity, UX impact)
     - Severity (critical / high / medium / low)
     - How you fixed it (fill this in during Phase 2) -->

## API Design
- Added a new /api/me route. Used for auth testing and for user management.
<!-- What changes did you make to the API?
     - Status codes, validation, error responses
     - Any conventions you followed (REST, JSON:API, RFC 7807)
     - How would this API evolve for production? -->

## Architecture Observations
<!-- What patterns or anti-patterns did you see?
     - How is business logic organized?
     - What would you change about the data model or service layer?
     - How does this map to DDD or clean architecture? -->

## Frontend Approach
<!-- What changes did you make to the frontend?
     - State management approach
     - Error handling strategy
     - Any framework you would use in production and why -->

## Improvement Implemented
<!-- Which improvement did you choose to implement and why?
     Why did you prioritize this one over others? -->

## Improvements Proposed
<!-- Describe 2 additional improvements you would make.
     For each: what, why, estimated effort, and trade-offs. -->

## AI Usage
<!-- If you used AI tools, describe:
     - Which tools and how you used them
     - What you validated or changed from AI suggestions
     - What you chose NOT to use AI for and why
     If you did not use AI tools, simply state that. -->

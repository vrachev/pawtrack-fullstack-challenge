# Full-Stack Engineering Decisions

## Audit Findings

### The below bugs are what I found from looking through the code. I stopped after a while because there are too many, but tried to cover most of the critical ones I saw. After this, I also instruced claude to investigate the codebase and find issues. I've picked some from claude that I think are worth adding here and added them below this list. Claude's audit lives in ./investigations/CLAUDE_AUDIT.md
- [✅ Critical] There is a race condition with booking creations. Two calls to createBooking can end up both booking the same slot with the sitter (this issue was noted in the readme).
     * Fixed with a per-sitter mutex (async-lock) around the overlap-check + write in createBooking. Acts as an in-memory stand-in for a DB row lock / unique index.
- [✅ Critical] In the GET /api/bookings route, we allow an admin to override the tenant view, but have no check to determine if the user is actually an admin.
     * Fixed by ignoring ?tenantId= unless auth.role is 'admin'.
- [✅ Critical] In authMiddleware, any user can assign themselves an admin role, or impersonate another user by using their user-id, or sign into any tenant they want to.
     * Fixed by reading only X-User-Id and deriving tenantId/role from a new users seed looked up in the store; X-Tenant-Id and X-User-Role headers are now ignored. Added a GET /api/me route so the dashboard (and tests) can observe the real auth context.
- [✅ Critical] Off-by-one pagination bug that led to loss of the first page of bookings. This one took me a bit to figure out when I tried signing in for the Seattle/Austin tenants. This bug made them show 0 bookings since they only had one page. Bug in booking-service.ts where we set the offset to be page * limit (but page starts at 1). So the first offset becomes 5, instead of 0.
     * Fixed with by subtracting 1 from the page. Verified fix manually through UI.
- [✅ Critical] Bookings are fetched in several places in the client side app code. There can be scenariors where multiple fetch requests are being processed, and the last one that returns may not be the most recent one. I think this explains the stale bookings bug in the readme.
     * Fixed with a monotonic request-sequence guard in fetchBookings: each call captures an incrementing seq at entry and short-circuits after each await if a newer call has started, so only the latest-dispatched fetch renders.
- [✅ Critical] In the GET /api/bookings/:id route, we don't check for tenant ownership, which is something we do in the pets API. This means someone can access any booking from across any tenant.
     * Fixed by returning 404 when the booking is missing OR when its tenantId doesn't match auth.tenantId (admins bypass). Uses the same 404 response for both cases to avoid a presence oracle. Also corrects the previous 200-on-miss status bug.
- [✅ Critical] The hasOverlap check in createBooking is incredibly brittle and broken. It strips out timezone information (b.scheduledDate.split('T')[0] just returns the date), so a user who passes in a scheduledDate with a different timezone to what is in the db will result in potential double bookings.
     * Fixed by computing each slot as (absolute start from scheduledDate) + duration derived from startTime/endTime with midnight wrap, so the overlap check uses absolute UTC timestamps. Also scoped the sitter lookup to the caller's tenant (store.getBookingsByTenant).
- [✅ High] We display a hardcoded tenant/user on the dashboard - el.textContent = `Tenant: PawTrack Portland | User: Staff`
     * Fixed by fetching GET /api/me on load and rendering the real tenantName / userId / role.

For this issue mentioned in the readme:
> - **A customer reported seeing another customer's bookings** in the dashboard

The language is ambiguous to me. In my understanding, a customer is a pet owner. But pet owners are not users of the dashboard, only admins, staff and sitters. 

Sitters are also customers (if we consider the product to be a 2-sided marketplace), so the bug may be referring to them. The dashboard does not filter by user-id, so all bookings are shown for the tenant, which means a sitter will see the bookings of all other sitters as well.


#### Below are issues found by Claude and validated/edited by me. I only added critical ones as there are too many issues to add and fix.
- [✅ Critical] PATCH /api/bookings/:id/status has no tenant check and no role check. A user in Portland can cancel or complete Seattle's bookings.
     * Fixed by rejecting cross-tenant PATCHes at the route layer with the same 404 response used for a missing booking (mirrors GET /:id). Admins bypass the tenant check. Side effect: PATCH against a non-existent id now returns 404 instead of 200 with {success:false}. Role-gating (who can cancel vs. who can confirm) remains out of scope.
- [✅ Critical] Status updates aren't transactional. Two concurrent PATCHes can both pass `confirmed → in_progress`, or one can pass `requested → confirmed` while another passes `requested → cancelled` with last-write-wins. History is also overwritten, so no way to audit what happened.
     * Observation: against the current code path the race is not observable — the PATCH handler, `updateStatus`, and every hook in between are fully synchronous, so Node's event loop serializes concurrent PATCHes naturally. The moment anyone adds an `await` (real DB, new middleware, async audit log) the race returns and tests wouldn't catch it. Fixed as defense-in-depth: wrapped `updateStatus`'s read-check-write in `bookingLock.acquire(bookingId, …)` (same async-lock used for Bug 1). Audit history is a separate concern.
- [✅ Critical] POST /api/bookings takes `petId` and `sitterId` from the request body and writes them to a new booking without verifying they belong to the caller's tenant. A Portland user can create bookings referencing Seattle pets or sitters.
     * Fixed by throwing in `bookingService.createBooking` when the pet or sitter is missing or not in the caller's tenant (single error message to avoid a presence oracle). Also changed the POST /api/bookings error catch to return 400 instead of 200 with `{success:false}`.
- [✅ Critical] The date filter is a string-prefix match on UTC — `scheduledDate.startsWith(date)`. booking_006 is stored as `2026-04-09T06:30:00Z` (April 8 23:30 PT); filtering for "2026-04-08" misses it and filtering for "2026-04-09" returns it wrongly. The seed even flags this in comments. The filter needs to interpret the date in the tenant's timezone (`Tenant.timezone` already exists).
     * Fixed by computing the filter day's UTC window in the tenant's timezone (via luxon `DateTime.fromISO(date, { zone }).startOf('day')`) and filtering by absolute timestamp. Added luxon as a dependency for robust timezone handling rather than hand-rolled `Intl.DateTimeFormat` offset math.
- [✅ High] Wrong HTTP status codes in a lot of places.
     * After fixing the earlier tenant/isolation bugs, two status codes remained wrong: POST /api/bookings returned 200 on success (now 201 Created) and PATCH /api/bookings/:id/status returned 200 on invalid status transitions (now 422 Unprocessable Entity). Other routes were already correct. Updated existing test assertions to match.


## API Design
* Added a /api/me route. Used for auth testing and for user management.
* Added a /api/sitters/available route to enable checking sitter availabilities.
* Fixed a bunch of incorrect status codes
* API evolution: rate-limiting, versioning (eg: /v1/), real auth, login flow etc..

## Architecture Observations
- What patterns or anti-patterns did you see?
     * There were a lot of anti-patterns, some of which we fixed (like clients being allowed to send in any auth and leaky tenant scopes). Some good patterns were the routes/services split and the EventEmitter which is a useful pattern for things like audit trails or analytics.
- How is business logic organized?
     * Split between the routes and the booking-service
- What would you change about the data model or service layer?
     * We made one change already with user seeding. The obvious necessary change however is to use a real DB (which also requires schema changes amongst other things)
- How does this map to DDD or clean architecture?
     * Current codebase is not very DDD flavored. For example, rules to correctly write/read data live at the service layer instead of at the data layer.

## Frontend Approach
- What changes did you make to the frontend?
     * Changes made: rendered the tenant/user banner from /api/me instead of hardcoding it, and added a sequence guard around fetchBookings so a slow in-flight request can't overwrite a newer one when the user changes filters mid-poll.
- State management approach
     * Kept it as a single mutable filters object plus per-render DOM diffs
- Error handling strategy
     * Didn't do much here
- Any framework you would use in production and why
     * Not much of a frontend expert so I'd have to look further into picking one framework over another, but I'm sure any of React, Svelte, Vue etc.. work just fine.

## Improvement Implemented
- Which improvement did you choose to implement and why?
     * Added a GET /api/sitters/available route. This allows users to see availabilities before trying to book so that they don't have to do trial and error booking.
     * Over the course of fixing bugs we also added a bunch of tests (for ai agent red/green tdd implementation) and also added the /api/me route + auth derived identity.
- Why did you prioritize this one over others?
     * Trial and error booking would be a major UX pain so this felt like a nice improvement.


## Improvements Proposed
- Describe 2 additional improvements you would make.
     * Migrating to a real DB
     * Self service booking product for pet owners.
- For each: what, why, estimated effort, and trade-offs.
     * The DB is kinda self-explanatory. Our current custom store is very brittle, slow, hard to extend and just plain unuseable in production. The change would be pretty significant for this codebase, as we'd have to - - - make big changes to the schema and the services code.
     * Right now pet owners don't exist as real users, just as metadata for pets. The easiest change would be to create a owner role and allow them to book via the current dashboard, but the better solution would be to create a new frontend tailored to them.

## AI Usage
- If you used AI tools, describe:
     - Which tools and how you used them
          * Claude code. I used it to surface issues, to plan out the implementation plans to fix all the bugs, for implementation, for ideation for features to implement, and for implementation for that as well.
     - What you validated or changed from AI suggestions
          * Validated all issues I pulled from claude. 
          * Back and forth conversations for all implementation plans.
          * To give a few specific examples on the latter:
               * The AI wrote the new /api/sitter/availability code in pets.ts, because that's where the existing sitter route was. I had it move it to its own file.
               * It handwrote datetime code to fix the overlap issue. I instructed it to use a robust time library since handrolling our own code is very bug prone.
     - What you chose NOT to use AI for and why
          * I only asked it to audit the codebase after I had done so. It's hard to get a good sense of whether the AI is correct or not without getting a good understanding first. And indeed, the AI had some issues trying to interpret the readme. Understanding the code first let me be more confident about the issues claude suggested, and which ones are critical vs not.
          * I used Claude for a few of the questions in the rest of the sections of this doc (such as to ask about clean architecture, which I had not heard of before), but I wrote all the answers myself as I prefer my own voice over Claude's.

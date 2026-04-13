# PawTrack Full-Stack Challenge

## The Scenario

You're joining **PawTrack**, a pet-sitting startup that connects pet owners with local sitters. The company has a small engineering team and recently lost its only full-stack developer. You're the first senior engineering hire.

The previous developer built a booking/scheduling API and a simple admin dashboard. Things are mostly working, but the team has started hearing complaints:

- **A customer reported seeing another customer's bookings** in the dashboard
- **A double-booking happened last week** — two sitters were assigned to the same pet at the same time
- **Staff say the dashboard sometimes shows stale data** — filters seem to "reset" randomly

Your job: **audit what exists, fix what's broken, and propose improvements.** The codebase is intentionally small so you can focus on code quality rather than navigating a large project.

## Time Limit

**90 minutes.** We value thoughtfulness over completeness. It's better to fix fewer things well and explain your reasoning than to rush through everything. Document your decisions as you go in `DECISIONS.md`.

## What You'll Find

```
pawtrack-fullstack-challenge/
  server/
    src/
      index.ts                  # Fastify app entry point
      routes/
        bookings.ts             # Booking CRUD + status transitions
        pets.ts                 # Pet and sitter lookup endpoints
      middleware/
        auth.ts                 # Tenant/user extraction from headers
      services/
        booking-service.ts      # Business logic layer
        event-emitter.ts        # Simple event bus
      store/
        memory-store.ts         # In-memory data store (simulates database)
        seed.ts                 # Seed data (3 tenants, 20 bookings, 13 pets)
      types/
        index.ts                # TypeScript type definitions
    package.json
    tsconfig.json
  client/
    index.html                  # Single-page dashboard
    app.js                      # Vanilla JavaScript — fetches from API, renders UI
    styles.css                  # Minimal styling
  DECISIONS.md                  # Your working document
```

The server is a **TypeScript/Fastify** API with an in-memory data store (no database setup required). The client is a **vanilla JavaScript** dashboard that talks to the API. You may modify anything in both `server/` and `client/`.

## Getting Started

1. Clone this repository
2. Install dependencies:
   ```bash
   cd server && npm install
   ```
3. Start the API server:
   ```bash
   cd server && npm run dev
   ```
   The API runs on **http://localhost:3001**
4. In a separate terminal, serve the client:
   ```bash
   npx serve client -l 3000 --cors
   ```
   The dashboard runs on **http://localhost:3000**
5. Open `DECISIONS.md` and start documenting

### Quick Test

```bash
# Health check
curl http://localhost:3001/health

# List bookings for Portland tenant
curl -H "X-Tenant-Id: tenant_portland" -H "X-User-Id: user_staff_portland" \
  http://localhost:3001/api/bookings

# List pets
curl -H "X-Tenant-Id: tenant_portland" -H "X-User-Id: user_staff_portland" \
  http://localhost:3001/api/pets
```

## The Three Phases

### Phase 1: Audit (suggested: ~25 minutes)

Review all server and client code. Document every issue you find in `DECISIONS.md`, including:

- What the issue is and which file it's in
- Why it matters (security risk, data integrity, UX impact)
- Severity (critical / high / medium / low)

Don't fix anything yet. Just document.

### Phase 2: Fix (suggested: ~40 minutes)

Fix the issues you found. Prioritize by severity — start with the most critical problems. Make your changes directly in the code.

For each fix, update `DECISIONS.md` with what you changed and why.

### Phase 3: Improve (suggested: ~25 minutes)

Choose **one** meaningful improvement to implement beyond fixing bugs. This could be adding input validation, improving error handling, adding tests, improving the API design, or anything else you think matters most. Implement it in code.

Then **propose two additional improvements** you would make given more time. Write these up in `DECISIONS.md` with enough detail that another engineer could implement them: what, why, estimated effort, and trade-offs.

## What We're Evaluating

| Area | What We're Looking For |
|---|---|
| **Security & multi-tenancy** | Can you identify and fix data isolation and input safety issues? |
| **API design & data integrity** | Do you understand REST conventions, validation, and concurrency? |
| **Architecture & patterns** | Do you think about service separation, domain events, and audit trails? |
| **Frontend quality** | Can you find and fix state management and rendering bugs? |
| **Decision-making** | Can you prioritize, make trade-offs, and explain your reasoning? |

We're not looking for perfection. We're looking for someone who thinks critically about full-stack systems, understands the "why" behind best practices, and communicates clearly.

## AI Usage Policy

You may use AI tools (ChatGPT, Copilot, Claude, etc.). If you do, document your usage honestly in `DECISIONS.md`:

- Which tools you used and how
- What you validated or changed from AI suggestions
- What you chose **not** to use AI for and why

We assess critical thinking about AI output, not whether you used it. Blindly pasting AI suggestions without understanding them is worse than not using AI at all.

## Submission

When you're done, make sure all your changes are committed and your `DECISIONS.md` is complete. Push to your fork or submit as instructed.

## Technical Requirements

- [Node.js](https://nodejs.org/) >= 20
- [TypeScript](https://www.typescriptlang.org/) >= 5.0
- [Fastify](https://fastify.dev/) v5
- Familiarity with REST API design, multi-tenant architecture, and vanilla JavaScript

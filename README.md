# SMC Platform

Members and events platform for the Specialty Masters Club (SMC), UW Foster School of Business,
Seattle. Includes magic-link sign-in, events with waitlists, QR check-in, post-event surveys,
club news, and a weekly digest email (Mailgun) that runs every Monday after an admin approves it.

## Stack

- **Web:** Next.js + TypeScript (`apps/web`); proxies `/api/*` to the API
- **API:** Node.js + Express + TypeScript (`apps/api`)
- **Worker:** Pacific-time schedules (croner) and a MySQL job queue (`apps/worker`)
- **Database:** MySQL 8+ via Prisma (`packages/db`)
- **Email:** Mailgun HTTP API, MJML templates (`packages/email`)
- **Shared:** `packages/config` (env validation), `core` (time, tokens, masking), `digest`
  (compose, schedule, send, workflow), `jobs` (queue)

## Local development

```sh
cp .env.example .env            # then set LINK_SIGNING_SECRET (openssl rand -base64 48)
npm install
npm run migrate:dev -w @smc/db  # local database only
npm run dev:api & npm run dev:web & npm run dev:worker
```

Email is written to `.dev-outbox/` in development; nothing is sent. Make yourself an admin after
signing up: `npm run grant-admin -w @smc/api -- you@uw.edu`.

## Checks

```sh
npm run lint && npm run typecheck
npm test                       # unit + integration (needs TEST_DATABASE_URL → *_test DB)
npm run build && npm run e2e   # Playwright (E2E_DATABASE_URL → *_e2e DB)
```

## Docs

- [Staging and go-live runbook](docs/staging-runbook.md): Mailgun, DNS (SPF/DKIM/DMARC),
  webhooks, environment, verification checklist
- [Acceptance criteria and evidence](docs/acceptance-criteria.md)

## Security

Secrets (Mailgun API key, webhook signing key, link signing secret) live only in server
environment variables. Never commit `.env` files. Logs and audit entries mask email addresses.

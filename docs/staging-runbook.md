# Weekly digest: staging and go-live runbook

How to set up Mailgun, configure the three services, and verify the weekly digest end to end on
staging before anything reaches real members.

**Golden rules**

- Never send test email to real members from production. Test sends go only to the admin who
  clicks "Send test to me"; staging sends go only to `EMAIL_ALLOWLIST`.
- Never send `From:` a `@uw.edu` address (we cannot publish SPF/DKIM for UW). The API and worker
  refuse to start if `MAIL_FROM` or `MAILGUN_DOMAIN` is on `uw.edu`.
- Secrets (`MAILGUN_API_KEY`, `MAILGUN_WEBHOOK_SIGNING_KEY`, `LINK_SIGNING_SECRET`) live only in
  the server environment, never in the repo, logs or chat.
- Production migrations and deploys need explicit sign-off.

## 1. Services

| Service       | Command                          | Notes                                                                                        |
| ------------- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| API (Express) | `node apps/api/dist/server.js`   | Public: `/webhooks/mailgun`, `/email/unsubscribe/one-click`.                                 |
| Web (Next.js) | `npx next start` in `apps/web`   | Proxies `/api/*` to the API (`API_BASE_URL` at build time).                                  |
| Worker        | `node apps/worker/dist/index.js` | Long-running. Schedules in `America/Los_Angeles`; polls the MySQL job queue. Not serverless. |

Build: `npm ci && npm run build` (set `API_BASE_URL` at build time; the web app's /api proxy is fixed then). Migrate (with approval): `npm run migrate:deploy -w @smc/db`, then load the website content once: `npm run seed:content -w @smc/worker` (fills only empty tables; rerun after `grant-admin` to add past events).
Deploy order: migrate → API → worker → web.

## 2. Environment

| Variable                        | Services    | Staging                                                             | Production                                                                          |
| ------------------------------- | ----------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `APP_ENV`                       | all         | `staging`                                                           | `production`                                                                        |
| `APP_BASE_URL` / `API_BASE_URL` | all         | https staging URLs                                                  | https production URLs                                                               |
| `DATABASE_URL`                  | all         | staging MySQL                                                       | production MySQL                                                                    |
| `MAIL_TRANSPORT`                | API, worker | `mailgun`                                                           | `mailgun`                                                                           |
| `MAILGUN_API_KEY`               | API, worker | secret                                                              | secret                                                                              |
| `MAILGUN_DOMAIN`                | API, worker | e.g. `mail-staging.<club-domain>` or the sandbox domain             | `mail.<club-domain>`                                                                |
| `MAILGUN_BASE_URL`              | API, worker | `https://api.mailgun.net` (US) or `https://api.eu.mailgun.net` (EU) | same region as the domain                                                           |
| `MAILGUN_WEBHOOK_SIGNING_KEY`   | API         | secret                                                              | secret                                                                              |
| `MAILGUN_TEST_MODE`             | API, worker | `true` for a dry run, then `false`                                  | `false`                                                                             |
| `MAIL_FROM`                     | API, worker | `Specialty Masters Club <news@mail-staging.<club-domain>>`          | `Specialty Masters Club <news@mail.<club-domain>>`                                  |
| `MAIL_REPLY_TO`                 | API, worker | `smcommittee@uw.edu`                                                | `smcommittee@uw.edu`                                                                |
| `EMAIL_ALLOWLIST`               | API, worker | the testers’ exact addresses, comma-separated                       | ignored                                                                             |
| `LINK_SIGNING_SECRET`           | API, worker | `openssl rand -base64 48` (different per environment)               | same, kept stable (rotating it invalidates unsubscribe links and check-in QR codes) |
| `DIGEST_EVENT_LOOKAHEAD_DAYS`   | API, worker | `21`                                                                | `21`                                                                                |
| `UPLOAD_DIR`                    | API         | persistent volume path for uploaded photos and posters              | same                                                                                |
| `DIGEST_LOGO_URL`               | API, worker | hosted PNG (https) once the logo is supplied                        | same                                                                                |

The API key must be able to **send** and **read events** (events are used to settle sends whose
outcome was unknown). Use the most restricted key Mailgun offers that allows both.

## 3. Mailgun domain and DNS

1. In Mailgun, add the sending domain `mail.<club-domain>` in the chosen region (staging may use
   `mail-staging.<club-domain>` or Mailgun’s sandbox domain with authorised recipients).
2. Publish the records Mailgun shows. Typical set:

   | Type                      | Host                                       | Value                                                               |
   | ------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
   | TXT (SPF)                 | `mail.<club-domain>`                       | `v=spf1 include:mailgun.org ~all`                                   |
   | TXT (DKIM)                | `<selector>._domainkey.mail.<club-domain>` | the 2048-bit key Mailgun generates                                  |
   | MX (bounces, recommended) | `mail.<club-domain>`                       | `mxa.mailgun.org` and `mxb.mailgun.org`, priority 10                |
   | TXT (DMARC)               | `_dmarc.<club-domain>`                     | `v=DMARC1; p=none; rua=mailto:dmarc@<club-domain>; adkim=r; aspf=r` |

   Click and open tracking are switched off in code, so the tracking CNAME is not needed.

3. Click **Verify DNS settings** in Mailgun and wait until every record is green.
4. After 2–4 weeks of clean DMARC reports, tighten to `p=quarantine`.

## 4. Webhooks

Mailgun → Sending → Webhooks, for the domain: point **Delivered**, **Permanent failure**,
**Temporary failure**, **Spam complaints** and **Unsubscribes** at
`https://<api-host>/webhooks/mailgun`. Copy the **HTTP webhook signing key** into
`MAILGUN_WEBHOOK_SIGNING_KEY`.

Check: use Mailgun’s **Test webhook** button for each event. The API must answer `200`; the
admin audit log (`/admin/audit?action=mailgun.`) shows the event. A request with a wrong
signature must answer `401` and appear as `mailgun.webhook.rejected`.

## 5. Staging verification

Prepare:

1. Deploy to staging with `MAILGUN_TEST_MODE=true` and `EMAIL_ALLOWLIST` set to the testers.
2. Sign up as each tester (tick “Send me extra news and invitations”), then make one an admin:
   `npm run grant-admin -w @smc/api -- you@uw.edu`.
3. Create and publish an event (with a capacity) and a news post, ideally a recruiting post with
   openings and a How to apply box.

Dry run (`MAILGUN_TEST_MODE=true`):

4. `npm run staging:draft -w @smc/worker`. This drafts this week’s issue as of Monday 08:30 PT and
   opens a one-hour approval window. It refuses to run in production.
5. In `/admin/digests/<id>`, check every fact against the source: event names, dates and times
   (PT), locations, seat counts, links, recipient count and scope. Use Desktop 720 / Mobile 390.
6. Approve. The worker sends within seconds; the issue becomes **Sent** and Mailgun logs show
   the messages as accepted in test mode (nothing is delivered).

Real delivery to the allowlist (`MAILGUN_TEST_MODE=false`):

7. Repeat 4–6. Each tester receives exactly one copy.
8. In Gmail, open **Show original** and confirm `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`, and the
   `From` domain is `mail.<club-domain>`. Confirm Gmail offers its own **Unsubscribe** link
   (List-Unsubscribe One-Click).
9. Rendering checklist. Check each client below in light and dark mode, with images on and off:

   | Client                    | Check                                                          |
   | ------------------------- | -------------------------------------------------------------- |
   | Gmail web                 | 600 px layout, Anton/Montserrat or the fallback fonts, buttons |
   | Gmail iOS / Android       | single column, full-width 48 px buttons, readable sizes        |
   | Apple Mail macOS / iOS    | web fonts load, dark mode keeps brand colors                   |
   | Outlook desktop (Windows) | bulletproof buttons, gold rules, openings table                |
   | Outlook web / new Outlook | same as above                                                  |

10. Unsubscribe from one copy using the footer link (confirm page), and from another using
    Gmail’s Unsubscribe (one-click). Both members show “Off (unsubscribed)” in
    `/admin/members` and are excluded from the next issue.
11. Audit: `/admin/digests/<id>` → Activity shows drafted → notified → test sent → approved →
    sending started → batch sent → sent, with the approving admin’s name and PT times.

## 6. Going live

- [ ] Logo PNG hosted over https and set in `DIGEST_LOGO_URL`.
- [ ] Production DNS verified; DMARC at `p=none` with a reporting address.
- [ ] Webhooks configured on the production domain; signing key set.
- [ ] `APP_ENV=production`, `MAILGUN_TEST_MODE=false`; staging-only tooling not used.
- [ ] Migrations applied with approval; API, worker and web deployed; worker running continuously.
- [ ] Digest paused for any break weeks (`/admin/digests` → Pause).
- [ ] First Monday: an admin is ready to review and approve between 08:00 and 18:00 PT.

## 7. When something goes wrong

- **Issue stuck in Sending**: `/admin/digests` → System health. Unknown batches are reconciled
  automatically 10 minutes after the uncertain send. Retrying batches back off 1/5/25/60 minutes.
- **Dead job**: admins receive “Background job failed”. Open the audit link, fix the cause
  (credentials, Mailgun outage), then re-run the step.
- **Not approved by 18:00 PT**: the issue expires automatically and nothing is sent. This is by
  design.
- **Need to stop a week**: Reject the draft, or Pause before Monday 08:00 PT.

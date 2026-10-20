# SMC Platform

Members and events platform for the Specialty Masters Club (SMC), UW Foster School of Business, Seattle.

## Stack

- **Web:** Next.js + TypeScript
- **API:** Node.js + Express + TypeScript
- **Database:** MySQL
- **Email:** Mailgun (HTTP API), MJML templates

## Status

Initial repository. The weekly digest feature plan is pending approval; no application code yet.

## Security

Secrets (Mailgun API key, webhook signing key, token secrets) live only in server environment variables. Never commit `.env` files.

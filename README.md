# AISOFT Automation

**Build Smarter. Automate Faster.**

AISOFT Automation is being developed as a combined self-service automation SaaS and custom automation service for retail, wholesale, e-commerce, recruitment and other businesses.

## Website
- Main website: https://aisoft-automation.vercel.app
- `/` — Marketing site, SaaS early access and custom service request form
- `/admin-requests.html` — Protected service-request inbox (requires `AISOFT_ADMIN_KEY`)
- `/privacy` — Privacy policy starter
- `/terms` — Terms starter
- `/data-deletion` — Data deletion information

## Current MVP capabilities
- Responsive landing page for SaaS early access and done-for-you automation services.
- Validated service-request form with server-side Neon PostgreSQL persistence at `POST /api/service-requests`.
- Admin-only request listing at `GET /api/service-requests`.
- Existing Meta integration endpoints under `/api/meta/` for approved/configured Meta integrations.
- Meta Pixel loads only when the visitor accepts marketing consent.

## Not yet complete
The current MVP does **not** yet provide self-service account creation, subscriptions/payment processing, isolated customer workspaces, a workflow execution engine, or an automatically responding WhatsApp bot. These require additional implementation, credentials, customer authorization and testing.

## Deployment and configuration
1. Verify this GitHub repository is connected to the Vercel project and that the production branch is `main`.
2. Set `DATABASE_URL` and `AISOFT_ADMIN_KEY` in Vercel before testing service-request submission.
3. Configure Meta variables only if you are enabling Meta integration endpoints. See [SAAS_SETUP.md](./SAAS_SETUP.md) for the full checklist.
4. Never commit API keys, access tokens, database credentials or encryption keys.

## Data and privacy
The request form collects the visitor's name, email, business details and stated automation requirement after consent. Review the privacy policy, retention policy, contact email and legal terms before public promotion. Do not use fake/demo customer records.

# AISOFT Automation — SaaS + custom-service MVP setup

This repository now contains:
- A public landing page for self-service SaaS early access and custom automation services.
- A public request intake API at `POST /api/service-requests`.
- A protected admin request list at `GET /api/service-requests`, shown by `/admin-requests.html`.
- Existing Meta integration endpoints under `/api/meta/`.

## Important status

The self-service signup/authentication, subscription billing, tenant workspace, workflow execution engine, and WhatsApp message automation are **not complete just because the landing page is live**. This MVP accepts and stores requests; it does not create SaaS accounts or send WhatsApp messages by itself.

## 1. Required Vercel environment variables

Open Vercel → project `aisoft-automation` → Settings → Environment Variables. Add to Production and Preview as appropriate:

| Variable | Required for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Saving and viewing service requests; existing Meta endpoints | Neon pooled connection string recommended. Keep server-side only. |
| `AISOFT_ADMIN_KEY` | Viewing service requests in the admin page | Generate a random secret of at least 32 characters. Do not put it in HTML, GitHub, or a public `NEXT_PUBLIC_*` variable. |
| `META_ADMIN_KEY` | Existing Meta admin API endpoints | Separate server-side key used by existing Meta endpoints. |
| `META_APP_ID` | Meta OAuth | App ID from Meta Developers. |
| `META_APP_SECRET` | Meta OAuth and webhook signature verification | Secret, server-side only. |
| `META_OAUTH_REDIRECT_URI` | Meta OAuth | Must match the deployed callback URL exactly: `https://YOUR-VERCEL-DOMAIN/api/meta/oauth/callback`. |
| `META_WEBHOOK_VERIFY_TOKEN` | Meta webhook verification | Create a random secret; use the same value in Meta Webhooks configuration. |
| `META_TOKEN_ENCRYPTION_KEY` | Encrypting stored Meta access tokens | Exactly 64 hexadecimal characters (32 random bytes). |
| `META_PIXEL_ID` | Optional Meta Pixel | Public pixel ID only; browser loads it only after consent. |
| `META_GRAPH_API_VERSION` | Optional Meta Graph version | Defaults to `v26.0` in current code; verify against your app's supported version. |

Generate secrets locally with a trusted password manager or secure terminal. Example commands:
- Encryption key: `openssl rand -hex 32`
- Admin key: `openssl rand -base64 36`

Do not paste secrets into ChatGPT or commit them to GitHub.

## 2. Deploy from GitHub

1. Open Vercel and select the existing `aisoft-automation` project.
2. Go to Settings → Git and verify the repository is `infoaisoft26-byte/aisoft-automation` and Production Branch is `main`.
3. Check the latest deployment. If Git integration is connected, commits to `main` should trigger a deployment automatically.
4. If no deployment starts, use Vercel → Deployments → Create Deployment and select the `main` branch, or reconnect the Git repository in Settings → Git.
5. Wait for Ready, then open the production URL and test the pages and API.

## 3. Smoke tests

- Open `/` and verify the SaaS and custom automation sections render.
- Submit the custom request form using a real test email and non-sensitive test details.
- Expect a request reference only when the API has successfully saved it.
- Open `/admin-requests.html`, enter the `AISOFT_ADMIN_KEY` value, and load the request.
- Verify `GET /api/service-requests` without the key returns 401.
- Verify no API key or Meta secret appears in page source or browser-visible environment variables.
- Test `GET /api/meta/webhook` with a valid Meta verification challenge after configuring Meta.
- Check Vercel function logs if a request returns 503; the usual cause is missing/invalid `DATABASE_URL`.

The service-request API creates its table on first use. It stores contact information and the request details submitted by the visitor. Restrict database access and delete records according to your privacy policy and retention requirements.

## 4. Next implementation milestones

1. Authentication (Neon Auth or another supported auth provider), verified email, and roles.
2. Multi-tenant organizations with strict per-tenant authorization and tests.
3. Customer dashboard and integration connection lifecycle.
4. WhatsApp Cloud API onboarding, webhook subscription, message inbox, templates and consent.
5. Workflow builder with safe execution, retries, idempotency and audit history.
6. Plans, usage metering and payment gateway integration.
7. Security review, privacy/terms review, backups, monitoring and production acceptance tests.

Do not advertise a feature as live until its backend, permissions, billing and error handling have been tested.

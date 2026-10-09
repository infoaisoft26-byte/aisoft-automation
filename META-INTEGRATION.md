# AISOFT Automation — Meta integration setup

This repository contains serverless integration endpoints. **Code deployment alone does not activate Meta APIs**; credentials, business assets, permissions, webhook subscriptions, and the database must be configured first.

## Endpoints

- `GET /api/meta/config` — returns only the public Meta Pixel ID.
- `POST /api/meta/oauth/start` — starts Facebook Login/OAuth. Requires `Authorization: Bearer <META_ADMIN_KEY>`.
- `GET /api/meta/oauth/callback` — exchanges OAuth code, fetches managed Pages, and stores Page/linked Instagram tokens encrypted in Postgres.
- `GET|POST /api/meta/webhook` — Meta webhook verification, signed payload verification, lead retrieval, and webhook event storage.
- `POST /api/meta/whatsapp/send` — sends a text message through WhatsApp Cloud API. Requires `Authorization: Bearer <META_ADMIN_KEY>`; do not call from public browser code.
- `POST /api/meta/instagram/send` — sends an Instagram message to a recipient who has already messaged the Professional account; requires the same admin header.
- `GET /api/meta/leads` — returns the latest stored Lead Ads records; requires the same admin header.
- `/meta-connect.html` — private/no-index operator page to start the Page-connection OAuth flow.

## Vercel environment variables

Set these in **Vercel → aisoft-automation → Settings → Environment Variables**, at least for Production (and Preview if you want to test there). Redeploy after changing variables.

Required for OAuth + persistent lead/webhook storage:
- `META_APP_ID` — Meta App ID (not secret).
- `META_APP_SECRET` — Meta App Secret; server-only, never expose to browser.
- `META_OAUTH_REDIRECT_URI` — exact callback URL, e.g. `https://aisoft-automation.vercel.app/api/meta/oauth/callback`. Must exactly match Meta Login settings.
- `META_ADMIN_KEY` — long random operator secret, at least 32 characters.
- `META_TOKEN_ENCRYPTION_KEY` — 32 random bytes encoded as 64 hexadecimal characters; used for AES-256-GCM token encryption.
- `DATABASE_URL` — Neon/Postgres connection string. Keep private.
- `META_WEBHOOK_VERIFY_TOKEN` — your own long random webhook verification string.
- `META_GRAPH_API_VERSION` — Graph API version currently enabled for your app (code fallback: `v26.0`).

Optional:
- `META_PIXEL_ID` — numeric Meta Pixel/Dataset ID. The site only loads Pixel after a visitor accepts analytics/marketing cookies.
- `WHATSAPP_PHONE_NUMBER_ID` — Phone Number ID from WhatsApp → API Setup.
- `WHATSAPP_ACCESS_TOKEN` — server-side system-user access token with `whatsapp_business_messaging`. Never expose it in HTML.
- `SITE_URL` — canonical site URL for links and consent-policy configuration if added later.

Generate secrets locally; do not commit them to GitHub. Example for encryption key: `openssl rand -hex 32`. Generate separate random values for `META_ADMIN_KEY` and `META_WEBHOOK_VERIFY_TOKEN`.

## Meta Developer setup

1. Create/select the Meta app at https://developers.facebook.com/apps/ and add Facebook Login, Webhooks, Instagram Graph API/Instagram product as needed, WhatsApp, and Pixel in the relevant Meta business tools.
2. In Facebook Login settings, add the exact `META_OAUTH_REDIRECT_URI` to **Valid OAuth Redirect URIs** and configure the site domain.
3. In App Settings → Basic, copy App ID and App Secret to Vercel only.
4. Connect the Facebook Page(s) you own/manage. For the Facebook Login Instagram API path, the Instagram account must be Professional (Business or Creator) and linked to a Facebook Page.
5. In Webhooks, configure callback URL `https://aisoft-automation.vercel.app/api/meta/webhook` and the same `META_WEBHOOK_VERIFY_TOKEN`. Subscribe to Page `leadgen` and required Page/Instagram/Messenger fields. For WhatsApp, subscribe the app to the WhatsApp Business Account in the WhatsApp product settings; configure WhatsApp webhook fields such as messages and statuses.
6. Grant the required permissions for the exact product use case. Typical scopes in this implementation: `pages_show_list`, `pages_read_engagement`, `leads_retrieval`, `pages_manage_metadata`, `pages_messaging`, `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`, and `instagram_content_publish`. Meta may require App Review/Advanced Access and business verification before serving people outside app roles.
7. For WhatsApp, set up a WhatsApp Business Account and verified business phone number. The system-user token should have `whatsapp_business_messaging`; management tasks may need `whatsapp_business_management`. Users must have opted in; approved templates are needed for business-initiated messages outside the customer-service window.
8. Create/configure a Meta Pixel in Events Manager and set its ID in `META_PIXEL_ID`. Pixel is loaded only after consent.

## How to connect the Page

After the variables and database are ready, send a POST request to `/api/meta/oauth/start` with `Authorization: Bearer <META_ADMIN_KEY>` and `Content-Type: application/json`. Open the returned `url` in a browser and complete authorization. The callback stores Page and linked Professional Instagram tokens encrypted. The OAuth callback currently does not provide a CRM dashboard or public lead-export endpoint; lead events are persisted in `meta_leads` and webhook payloads in `meta_webhook_events`, accessible only through the configured database/admin tooling.

## Facebook Login scope

The OAuth flow in this repository uses Facebook Login to authorize an administrator to connect managed Pages and linked Instagram Professional accounts. The current site is a static marketing website with no customer account database or protected user area, so this is **not yet a customer-facing “Sign in with Facebook” feature**. Do not advertise consumer login as live until a user-account/session flow is designed and tested.

## Security and production notes

- Never commit tokens, app secrets, database URLs, or admin keys.
- Rotate any credential accidentally shared publicly.
- Configure consent and privacy disclosures before enabling tracking. Use only data you are authorized to process and comply with Meta policies and applicable privacy law.
- Test with app roles and test leads first. Do not claim production approval until Meta App Review, business verification, webhook delivery, and a real test lead/message have been verified.

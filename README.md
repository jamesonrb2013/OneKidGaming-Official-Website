# OneKidGaming Community Website + Portal

**Current version: 1.1.0** — visual refresh, live homepage announcement ribbon, and visible site-version marker. The version is incremented whenever a fix or feature update is shipped.

Responsive website with a Node/Express API and MySQL-backed account portal.

## Pages
- `index.html` — homepage and project hub
- `blog.html` — blog landing page
- `help.html` — help center
- `announcements.html` — announcements
- `staff.html` — team directory
- `login.html` — member registration and sign-in
- `dashboard.html` — role-aware member, staff, and owner dashboards
- `owner-setup.html` — one-time owner bootstrap page, protected by an environment token

## Database and environment
The server creates the required MySQL tables on first start: `okg_users`, `okg_sessions`, `okg_audit_logs`, `okg_support_tickets`, and `okg_announcements`.

Set environment variables in the hosting dashboard. Never commit real secrets:
- `NODE_ENV=production`
- `PORT=8080`
- `SESSION_SECRET` — unique random secret, at least 32 characters
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `DB_SSL=true` for Aiven TLS
- `PUBLIC_ORIGIN` — exact HTTPS origin of the preview service
- `OWNER_BOOTSTRAP_TOKEN` — temporary random secret, at least 32 characters

## First owner setup
1. Deploy only to the preview service and configure database + environment variables.
2. Visit `/owner-setup.html` over HTTPS and create the owner using the configured token.
3. Immediately remove `OWNER_BOOTSTRAP_TOKEN` from the service environment and restart/redeploy.
4. The owner setup endpoint refuses to create another owner after one exists. Public registration can only create member accounts. The owner can promote members to staff.

## Security status
Implemented: bcrypt password hashes, database-backed sessions, HTTP-only session cookies, session ID regeneration on sign-in, same-origin API checks, request size limits, rate limiting on authentication, server-side role checks, and audit events. The owner role cannot be selected during public registration.

Before production launch, add email verification and password reset, verify database backups/restore, and test the deployment with real TLS. Member registration is open in this preview, so add anti-abuse controls before a broad public launch.

## Deployment
The Dockerfile runs the Node app on port 8080. Keep preview separate from the official domain; do not change DNS or deploy to the official domain without explicit approval.

## Community links
- Discord: https://discord.gg/nePR9dnuYm
- Roblox community: https://www.roblox.com/share/g/874633301
- Support email: support@onekidgaming.blitz.cloud

## Version history
- `1.1.0` — Refined visual system, responsive spacing, keyboard focus styling, live homepage announcement ribbon, and visible version marker.
- `1.0.0` — Initial Node/Express portal, database-backed accounts, support tickets, announcements, and role-protected dashboards.

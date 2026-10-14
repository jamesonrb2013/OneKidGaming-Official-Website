# OneKidGaming Community Website

A responsive, playful dark-mode website for the OneKidGaming community.

## Pages
- `index.html` — homepage and project hub
- `blog.html` — blog landing page (editorial entries are placeholders until publishing is connected)
- `help.html` — help center and support guidance
- `announcements.html` — announcements page (content is clearly marked as starter content)
- `staff.html` — team directory
- `login.html` and `dashboard.html` — account portal UI and dashboard concept

## Local preview
Open `index.html` in a browser or run a static server from the repository root.

## Important account/security status
The account portal is currently a front-end preview only. Real registration, sign-in, sessions, user profiles, staff/owner permissions, and live dashboard data are **not enabled**. Do not use the preview UI to collect passwords. A production account system requires a backend, a database, secure session handling, and server-enforced role permissions. The owner role must never be selectable from public sign-up.

## Deployment
The Dockerfile serves the static site with Nginx on port 8080. The preview should be deployed separately from the official domain. Do not change DNS or deploy to the official domain without explicit approval.

## Community links
- Discord: https://discord.gg/nePR9dnuYm
- Roblox community: https://www.roblox.com/share/g/874633301
- Support email: support@onekidgaming.blitz.cloud

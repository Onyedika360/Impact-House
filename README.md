# Impact House — Church Communications App

A full-stack web app for managing church members and sending email and SMS newsletters.
Admins manage everything through a private dashboard. Members can self-register via a public sign-up link.

---

## Tech Stack

| Layer    | Technology                                    |
|----------|-----------------------------------------------|
| Frontend | Vanilla HTML / CSS / JS (single file, no build step) |
| Backend  | Node.js + Express                             |
| Database | PostgreSQL on [Neon](https://neon.tech)       |
| Auth     | [Clerk](https://clerk.dev) — production instance with custom domain, JWT verification, invitation API |
| Email    | SendGrid (newsletters) + Clerk (auth / invitation emails) |
| SMS      | Twilio — pending account verification         |
| Deploy   | Render (API) + Vercel (frontend)              |

---

## Features

### Member Management
- Add, edit, and deactivate members with name, email, phone, gender, and notes
- **Phone normalisation** — any format (`(555) 123-4567`, `555.123.4567`, `+15551234567`) is stored as E.164 (`+15551234567`)
- **Multi-tag system** — primary tags (General Members, Workforce) + unlimited admin-created custom tags
- **Bulk CSV upload** — import many members at once from a spreadsheet; per-row results reported (created / duplicate / error)
- **Export CSV** — download the full member list
- **Filters** — filter by gender, notify preference, and group; search by name, email, or phone
- **Pagination** on both the member list and message log

### Messaging
- **Email via SendGrid** — immediate and scheduled sends
- **SMS via Twilio** — plumbed in, waiting on account verification
- **Scheduled messages** — 30-minute minimum window; cancellable before they fire
- **Target audience** — broadcast to all members or to a specific group
- **Per-delivery tracking** — each send logs delivered / failed status per member
- **Send rate limit** — 60-second cooldown per user to prevent accidental double-sends

### Compose UX (Email + SMS)
- **HTML preview** — toggle between editing and a rendered preview (sanitised with DOMPurify)
- **Drafts** — save mid-work; resume later; updates in place (no duplicates)
- **Templates** — save a draft as a reusable template; loading a template leaves the original intact
- **Test send** — deliver a copy to the admin's own email before broadcasting
- **Live recipient count** — shows how many members will receive the message based on the selected group and channel
- **Personalisation tokens** — `{{first_name}}` and `{{last_name}}` are substituted per recipient at send time, in both subject and body

### Email Footer
Every outgoing email automatically appends a per-recipient unsubscribe link:
`"Don't want these emails? Unsubscribe: <link>"`
Clicking the link immediately opts that member out — no login required.

### Public Sign-up
Admins share a QR code or URL pointing to `/signup`.
Anyone can fill in their name, email, phone, gender, and notification preference.
Successful sign-ups are auto-tagged as **General Members** and appear in the admin dashboard instantly.

### Unsubscribe
`GET /api/public/unsubscribe?token=…` — token is unique per member and embedded in every email footer.
Sets `notify_email = false`, `notify_sms = false`, and records `unsubscribed_at`.
Unsubscribed members are excluded from all future sends and recipient counts.
Revisiting the link shows an "already unsubscribed" confirmation — the action is idempotent.

### Team & Access Control

Access is managed through a `users` table in the database. There are two roles:

| Role   | Capabilities                                                    |
|--------|-----------------------------------------------------------------|
| admin  | Full access: member management, messaging, team management, invitations |
| editor | Can send messages and view members; cannot delete members/tags, manage team, or invite |

**Auto-provisioning on first sign-in:**
The DB `users` whitelist is no longer required. Clerk itself is the access guard — only users with a Clerk account (created via sign-up or invitation) can reach the API. On a user's first authenticated request, `middleware/auth.js`:
1. Verifies the Clerk JWT
2. Looks up the user in our `users` table
3. If absent, calls Clerk to fetch their profile (email, name)
4. Reads role from `clerkUser.publicMetadata.role` (set when the invitation was created)
5. Falls back to **admin if the users table is empty** (first user bootstrap), **editor otherwise**
6. Inserts the new user row and continues

This makes deployment simple: just create your first Clerk account on the production instance, sign in, and you'll automatically be admin. All subsequent users come in via invitations with explicit roles.

**Inviting team members (Clerk-native flow):**
1. Admin goes to **Team** in the sidebar → **+ Invite Team Member**
2. Enters the invitee's **first name, last name, email, role**
3. Backend calls `clerkClient.invitations.createInvitation({...})` — Clerk sends the email itself (no SendGrid for invites)
4. A lightweight record is stored in our `invitations` table for audit (who invited whom, when, what role)
5. Invitee clicks the link → lands on `/accept-invite?__clerk_ticket=…`
6. The custom accept page validates the ticket via `signUp.create({ strategy: 'ticket' })`, fetches their pre-set name + role from `/api/public/invitation-info`, shows a single password input
7. They set a password → account created, signed in, redirected to the app
8. The auto-provision middleware reads role from the invitation's Clerk publicMetadata and inserts the DB user row

**Pending invitations** appear in the Team panel with both **Resend** and **Revoke** actions. Resend revokes the existing Clerk invitation and creates a fresh one with the same details.

---

## Project Structure

```
impact-house/
├── backend/
│   ├── db/
│   │   ├── index.js                       # Connection pool (Neon / PostgreSQL)
│   │   ├── migrate-clerk.js               # Adds Clerk user ID column to members (early migration)
│   │   ├── migrate-groups.js              # Creates groups + member_tags tables
│   │   ├── migrate-templates.js           # Creates message_templates table
│   │   ├── migrate-public-features.js     # Adds gender, unsubscribe_token, unsubscribed_at to members
│   │   ├── migrate-users.js               # Creates users + invitations tables (legacy schema)
│   │   ├── migrate-invitations-v2.js      # Swaps invitations to Clerk-native (clerk_invitation_id, revoked_at)
│   │   └── migrate-invitations-v3.js      # Adds first_name + last_name to invitations
│   ├── middleware/
│   │   ├── auth.js                        # Clerk JWT verify + DB lookup + auto-provision on first sign-in
│   │   └── requireRole.js                 # Role-based access guard (requireRole('admin'))
│   ├── routes/
│   │   ├── auth.js                        # /auth/me, /auth/team, /auth/team/:id (role/status update)
│   │   ├── invitations.js                 # Create, list, resend, revoke Clerk invitations
│   │   ├── members.js                     # Member CRUD, groups, bulk upload
│   │   ├── messages.js                    # Compose, send, schedule, drafts, test send
│   │   ├── stats.js                       # Dashboard numbers
│   │   ├── templates.js                   # Saved message templates
│   │   └── public.js                      # Public sign-up, unsubscribe, invitation-info lookup
│   ├── services/
│   │   ├── email.js                       # SendGrid batch send, test send, personalisation, footer
│   │   ├── sender.js                      # Shared dispatch helper (builds recipient list, inserts deliveries)
│   │   └── phone.js                       # Phone normalisation to E.164
│   ├── scheduler.js                       # Polls every 60 s for scheduled messages due to send
│   ├── server.js                          # Express entry point
│   └── package.json
├── frontend/
│   ├── index.html                         # Full admin UI (single file, inline JS + CSS) — also hosts sign-in / sign-up toggle
│   ├── signup.html                        # Public member self-registration page
│   └── accept-invite.html                 # Team invitation acceptance page (custom password-only flow)
├── render.yaml                            # Render deploy config
├── vercel.json                            # Vercel deploy config
└── README.md
```

---

## Database Schema

| Table               | Purpose                                                        |
|---------------------|----------------------------------------------------------------|
| `members`           | Member records (name, contact, gender, tags, unsubscribe token)|
| `groups`            | Tags — type `primary` (built-in) or `custom` (admin-created)  |
| `member_tags`       | Many-to-many join between members and groups                   |
| `messages`          | Every composed message (draft / scheduled / sent)              |
| `message_deliveries`| Per-member, per-channel delivery record with status            |
| `message_templates` | Saved reusable templates                                       |
| `users`             | Admin/editor accounts (clerk_id, email, name, role, status)    |
| `invitations`       | Audit record of team invitations (clerk_invitation_id, email, first_name, last_name, role, invited_by, created_at, revoked_at) |

---

## Environment Variables

Create `backend/.env` (never commit this file):

```env
# Database
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require

# Clerk — production instance with custom domain
CLERK_SECRET_KEY=sk_live_...

# SendGrid — used for newsletters (NOT invitation emails — Clerk handles those)
SENDGRID_API_KEY=SG.xxxxxxx
SENDGRID_FROM_EMAIL=newsletter@impacthouse.org
SENDGRID_FROM_NAME=Impact House Church

# Public URL of this backend — used in email unsubscribe links
PUBLIC_URL=https://impact-house.onrender.com

# Frontend URL — used for CORS and the invitation redirect URL Clerk emails
FRONTEND_URL=https://app.tkpimpacthouse.org

# Twilio (add when verified)
# TWILIO_ACCOUNT_SID=ACxxxxxxx
# TWILIO_AUTH_TOKEN=your_token
# TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
```

> **Note:** `ALLOWED_CLERK_IDS` and `INITIAL_ADMIN_*` are no longer used. Access is gated by Clerk itself; roles are stored in our `users` table and auto-provisioned on first sign-in (first user → admin, subsequent → editor unless an invitation set a role in Clerk publicMetadata).

The Clerk publishable key (`pk_live_…`) is hard-coded in the frontend HTML files — it's safe to expose. Development conditional keys (`pk_test_…`) have been removed so production never accidentally loads the dev Clerk instance.

---

## Local Development

### 1. Clone & install

```bash
git clone https://github.com/Onyedika360/Impact-House.git
cd impact-house/backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in the variables listed above
```

### 3. Run migrations (one-time, in order)

```bash
node db/migrate-clerk.js
node db/migrate-groups.js
node db/migrate-templates.js
node db/migrate-public-features.js
node db/migrate-users.js              # creates users + invitations tables
node db/migrate-invitations-v2.js     # swaps invitations to Clerk-native (drops token, adds clerk_invitation_id + revoked_at)
node db/migrate-invitations-v3.js     # adds first_name + last_name to invitations
```

Each script is safe to re-run (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`).

`migrate-users.js` creates the empty `users` and `invitations` tables. There is no admin seeding step — the first user to sign in via Clerk becomes admin automatically.

### 4. Start the API

```bash
npm run dev   # nodemon — auto-restarts on changes
npm start     # plain node
```

API runs at `http://localhost:4000`.

### 5. Open the frontend

The frontend always points at the production Clerk + API endpoints. To work locally, serve the static files and set `window.ENV_API_URL` in your browser console if you need to point at a local backend, or run a quick patch to swap URLs.

```bash
npx serve frontend
```

| URL | Description |
|-----|-------------|
| `https://app.tkpimpacthouse.org/` | Admin dashboard + sign-in / sign-up toggle |
| `https://app.tkpimpacthouse.org/signup` | Public member sign-up |
| `https://app.tkpimpacthouse.org/accept-invite?__clerk_ticket=…` | Team invite acceptance |

---

## Deploying to Production

### Backend → Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your GitHub repo
4. Set **Root Directory** to `backend`
5. Set **Build Command**: `npm install`
6. Set **Start Command**: `npm start`
7. Add environment variables from the list above (set `FRONTEND_URL` to `https://app.tkpimpacthouse.org`)
8. Run migrations once against Neon after the first deploy (see migration list above)

### Frontend → Vercel

Vercel is configured automatically via `vercel.json`. Routes:
- `/signup` → `frontend/signup.html`
- `/accept-invite` → `frontend/accept-invite.html`
- everything else → `frontend/index.html`

Just push to `main` — Vercel redeploys on every push.

### Clerk

The production Clerk instance uses custom domains:
- `clerk.app.tkpimpacthouse.org` — frontend API (FAPI)
- `accounts.app.tkpimpacthouse.org` — Account Portal

Both require CNAME records pointing at `frontend-api.clerk.services` and `accounts.clerk.services` respectively. Once DNS resolves, the Clerk JS client loaded by the frontend reaches these endpoints directly.

**Dashboard configuration required:**
- **User & Authentication → Email** → Email verification code enabled for sign-up and sign-in
- **Restrictions → Sign-up mode** → Public (or Restricted if you only want invitation-based onboarding; restricted mode causes `mountSignUp` to render nothing, so use Public unless you exclusively rely on invitations)

---

## API Reference

### Public (no authentication)

| Method | Endpoint                                  | Description                                       |
|--------|-------------------------------------------|---------------------------------------------------|
| POST   | /api/public/signup                        | Self-register as a member (rate-limited: 10/hr)   |
| GET    | /api/public/unsubscribe?token=            | Opt out of all messages via email footer link     |
| GET    | /api/public/invitation-info?email=        | Lookup pending invitation (rate-limited; called by the accept page after the Clerk ticket validates the email) |

### Auth *(auth required)*

| Method | Endpoint             | Description                                          |
|--------|----------------------|------------------------------------------------------|
| GET    | /api/auth/me         | Current user's profile and role                      |
| GET    | /api/auth/team       | List all team members                                |
| PATCH  | /api/auth/team/:id   | Update a team member's role or status (admin only)   |

### Invitations *(auth required, admin only)*

| Method | Endpoint                       | Description                                       |
|--------|--------------------------------|---------------------------------------------------|
| POST   | /api/invitations               | Create a Clerk invitation (requires first_name, last_name, email, role) |
| GET    | /api/invitations               | List pending (non-revoked) invitations            |
| POST   | /api/invitations/:id/resend    | Revoke the existing Clerk invitation and send a fresh one for the same email |
| DELETE | /api/invitations/:id           | Revoke a pending invitation                       |

### Members *(auth required)*

| Method | Endpoint                    | Description                                        |
|--------|-----------------------------|----------------------------------------------------|
| GET    | /api/members                | List members (search, gender, notify, group, page) |
| POST   | /api/members                | Add a member                                       |
| POST   | /api/members/bulk           | Bulk import from parsed CSV rows                   |
| PATCH  | /api/members/:id            | Edit a member                                      |
| DELETE | /api/members/:id            | Remove a member (admin only)                       |
| GET    | /api/members/groups/list    | List all groups (primary + custom)                 |
| POST   | /api/members/groups         | Create a custom tag                                |
| DELETE | /api/members/groups/:id     | Delete a custom tag (admin only)                   |

### Messages *(auth required)*

| Method | Endpoint                       | Description                                    |
|--------|--------------------------------|------------------------------------------------|
| GET    | /api/messages                  | Message history (channel, status, page filters)|
| POST   | /api/messages                  | Create draft / schedule / send immediately     |
| POST   | /api/messages/test             | Test send to admin's email (no DB record)      |
| GET    | /api/messages/recipient-count  | Count eligible recipients for a channel/group  |
| POST   | /api/messages/:id/send         | Promote a draft to sent                        |
| PATCH  | /api/messages/:id              | Edit a draft or scheduled message              |
| DELETE | /api/messages/:id              | Cancel a draft or scheduled message (admin only)|
| GET    | /api/messages/:id/deliveries   | Per-member delivery report                     |

### Templates *(auth required)*

| Method | Endpoint            | Description              |
|--------|---------------------|--------------------------|
| GET    | /api/templates      | List templates (by channel) |
| POST   | /api/templates      | Save a new template      |
| GET    | /api/templates/:id  | Get a single template    |
| PATCH  | /api/templates/:id  | Update a template        |
| DELETE | /api/templates/:id  | Delete a template        |

### Stats *(auth required)*

| Method | Endpoint    | Description            |
|--------|-------------|------------------------|
| GET    | /api/stats  | Dashboard numbers      |

---

## Roadmap

- [ ] Twilio SMS — live once account is verified
- [x] Token-based one-click unsubscribe
- [x] Bulk CSV member import
- [x] Public member sign-up page
- [x] Multi-user team with role-based access (admin / editor)
- [x] Clerk-native team invitations with custom branded accept page
- [x] Resend invitation
- [x] Auto-provisioning on first sign-in (no manual admin seeding)
- [ ] SendGrid event webhook → real open / delivery rates
- [ ] Per-user analytics (who sent what)
- [ ] External sign-up form API integration
- [ ] WYSIWYG email editor

---

Built with care for Impact House Church.

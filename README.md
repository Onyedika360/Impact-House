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
| Auth     | [Clerk](https://clerk.dev) — JWT verification |
| Email    | SendGrid ✅ live                               |
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

**Inviting team members:**
1. Admin goes to **Team** in the sidebar → **Invite Team Member**
2. Enters the invitee's email and role → a 72-hour invite link is sent via SendGrid
3. Invitee visits `/accept-invite?token=…`, signs in with Clerk, and clicks **Accept Invitation**
4. Their account is created and they can log in immediately

**Bootstrap:** The first admin is seeded from the `INITIAL_ADMIN_*` environment variables (or migrated from `ALLOWED_CLERK_IDS`) when the `migrate-users.js` migration runs. All subsequent team members are added via invitations.

---

## Project Structure

```
impact-house/
├── backend/
│   ├── db/
│   │   ├── index.js                  # Connection pool (Neon / PostgreSQL)
│   │   ├── migrate-clerk.js          # Adds Clerk user ID column to members (early migration)
│   │   ├── migrate-groups.js         # Creates groups + member_tags tables
│   │   ├── migrate-templates.js      # Creates message_templates table
│   │   ├── migrate-public-features.js# Adds gender, unsubscribe_token, unsubscribed_at to members
│   │   └── migrate-users.js          # Creates users + invitations tables; seeds first admin
│   ├── middleware/
│   │   ├── auth.js                   # Clerk JWT verification + DB users lookup; sets req.user
│   │   └── requireRole.js            # Role-based access guard (requireRole('admin'))
│   ├── routes/
│   │   ├── auth.js                   # /auth/me, /auth/team, /auth/team/:id (role/status update)
│   │   ├── invitations.js            # Send, list, revoke, and accept team invitations
│   │   ├── members.js                # Member CRUD, groups, bulk upload
│   │   ├── messages.js               # Compose, send, schedule, drafts, test send
│   │   ├── stats.js                  # Dashboard numbers
│   │   ├── templates.js              # Saved message templates
│   │   └── public.js                 # Public sign-up, unsubscribe, and invite-token validation (no auth)
│   ├── services/
│   │   ├── email.js                  # SendGrid batch send, test send, personalisation, footer
│   │   ├── sender.js                 # Shared dispatch helper (builds recipient list, inserts deliveries)
│   │   └── phone.js                  # Phone normalisation to E.164
│   ├── scheduler.js                  # Polls every 60 s for scheduled messages due to send
│   ├── server.js                     # Express entry point
│   └── package.json
├── frontend/
│   ├── index.html                    # Full admin UI (single file, inline JS + CSS)
│   ├── signup.html                   # Public self-registration page
│   └── accept-invite.html            # Team invitation acceptance page
├── render.yaml                       # Render deploy config
├── vercel.json                       # Vercel deploy config
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
| `invitations`       | Pending team invitations (token, role, expiry, accepted_at)    |

---

## Environment Variables

Create `backend/.env` (never commit this file):

```env
# Database
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require

# Clerk
CLERK_SECRET_KEY=sk_live_...

# SendGrid
SENDGRID_API_KEY=SG.xxxxxxx
SENDGRID_FROM_EMAIL=newsletter@impacthouse.org
SENDGRID_FROM_NAME=Impact House Church

# Public URL of this backend — used in email unsubscribe links and invite emails
PUBLIC_URL=https://impact-house.onrender.com

# Frontend URL — used for CORS and invite accept links
FRONTEND_URL=https://impact-house.vercel.app

# Twilio (add when verified)
# TWILIO_ACCOUNT_SID=ACxxxxxxx
# TWILIO_AUTH_TOKEN=your_token
# TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
```

> **Note:** `ALLOWED_CLERK_IDS` is no longer used. Access is controlled via the `users` table.  
> The first admin must be seeded by running `migrate-users.js` (see below).

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
node db/migrate-users.js          # creates users + invitations tables; seeds first admin
```

Each script is safe to re-run (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`).

`migrate-users.js` will prompt you for the first admin's Clerk user ID, email, and name if no `INITIAL_ADMIN_*` env vars are set — or it seeds from those vars automatically.

### 4. Start the API

```bash
npm run dev   # nodemon — auto-restarts on changes
npm start     # plain node
```

API runs at `http://localhost:4000`.

### 5. Open the frontend

```bash
# Serve over HTTP so API calls work correctly
npx serve ../frontend
```

Or open `frontend/index.html` directly in your browser — API calls to `localhost:4000` still work because the dev CORS config allows requests with no origin.

| URL | Description |
|-----|-------------|
| `http://localhost:3000/` | Admin dashboard |
| `http://localhost:3000/signup.html` | Public member sign-up |
| `http://localhost:3000/accept-invite.html?token=…` | Team invite acceptance |

---

## Deploying to Production

### Backend → Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your GitHub repo
4. Set **Root Directory** to `backend`
5. Set **Build Command**: `npm install`
6. Set **Start Command**: `npm start`
7. Add environment variables from the list above
8. Run migrations once against Neon after the first deploy:
   ```bash
   # From your local machine with DATABASE_URL set
   cd backend
   node db/migrate-clerk.js
   node db/migrate-groups.js
   node db/migrate-templates.js
   node db/migrate-public-features.js
   node db/migrate-users.js
   ```

### Frontend → Vercel

Vercel is configured automatically via `vercel.json`.  
Just push to `main` — Vercel redeploys on every push.

The Clerk publishable key is hard-coded in the frontend files (it is safe to expose).

---

## API Reference

### Public (no authentication)

| Method | Endpoint                            | Description                                      |
|--------|-------------------------------------|--------------------------------------------------|
| POST   | /api/public/signup                  | Self-register as a member (rate-limited: 10/hr)  |
| GET    | /api/public/unsubscribe?token=      | Opt out of all messages via email footer link    |
| GET    | /api/public/validate-invite?token=  | Validate an invite token (used by accept page)   |

### Auth *(auth required)*

| Method | Endpoint             | Description                                          |
|--------|----------------------|------------------------------------------------------|
| GET    | /api/auth/me         | Current user's profile and role                      |
| GET    | /api/auth/team       | List all team members                                |
| PATCH  | /api/auth/team/:id   | Update a team member's role or status (admin only)   |

### Invitations *(auth required)*

| Method | Endpoint                   | Description                                       |
|--------|----------------------------|---------------------------------------------------|
| POST   | /api/invitations           | Send a team invitation email (admin only)         |
| GET    | /api/invitations           | List pending invitations (admin only)             |
| DELETE | /api/invitations/:id       | Revoke a pending invitation (admin only)          |
| POST   | /api/invitations/accept    | Accept an invitation and create user account      |

### Members *(auth required)*

| Method | Endpoint                    | Description                                        |
|--------|-----------------------------|---------------------------------------------------|
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
- [x] Email invitation flow for new team members
- [ ] SendGrid event webhook → real open / delivery rates
- [ ] Per-user analytics (who sent what)
- [ ] External sign-up form API integration
- [ ] WYSIWYG email editor

---

Built with care for Impact House Church.

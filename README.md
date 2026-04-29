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
| Auth     | [Clerk](https://clerk.dev) — admin-only       |
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

### Admin Access
Access is restricted to a whitelist of Clerk user IDs set in the `ALLOWED_CLERK_IDS` environment variable.  
Multiple admins are supported. No self-registration for admins.

---

## Project Structure

```
impact-house/
├── backend/
│   ├── db/
│   │   ├── index.js                  # Connection pool (Neon / PostgreSQL)
│   │   ├── migrate-clerk.js          # Adds Clerk user ID column to members
│   │   ├── migrate-groups.js         # Creates groups + member_tags tables
│   │   ├── migrate-templates.js      # Creates message_templates table
│   │   └── migrate-public-features.js# Adds gender, unsubscribe_token, unsubscribed_at to members
│   ├── middleware/
│   │   └── auth.js                   # Clerk JWT verification + allowlist check
│   ├── routes/
│   │   ├── auth.js                   # Clerk session passthrough
│   │   ├── members.js                # Member CRUD, groups, bulk upload
│   │   ├── messages.js               # Compose, send, schedule, drafts, test send
│   │   ├── stats.js                  # Dashboard numbers
│   │   ├── templates.js              # Saved message templates
│   │   └── public.js                 # Public sign-up + unsubscribe (no auth)
│   ├── services/
│   │   ├── email.js                  # SendGrid batch send, test send, personalisation, footer
│   │   ├── sender.js                 # Shared dispatch helper (builds recipient list, inserts deliveries)
│   │   └── phone.js                  # Phone normalisation to E.164
│   ├── scheduler.js                  # Polls every 60 s for scheduled messages due to send
│   ├── server.js                     # Express entry point
│   └── package.json
├── frontend/
│   ├── index.html                    # Full admin UI (single file, inline JS + CSS)
│   └── signup.html                   # Public self-registration page
├── render.yaml                       # Render deploy config
├── vercel.json                       # Vercel deploy config
└── README.md
```

---

## Database Schema

| Table               | Purpose                                              |
|---------------------|------------------------------------------------------|
| `members`           | Member records (name, contact, gender, tags, unsubscribe token) |
| `groups`            | Tags — type `primary` (built-in) or `custom` (admin-created) |
| `member_tags`       | Many-to-many join between members and groups         |
| `messages`          | Every composed message (draft / scheduled / sent)    |
| `message_deliveries`| Per-member, per-channel delivery record with status  |
| `message_templates` | Saved reusable templates                             |

---

## Environment Variables

Create `backend/.env` (never commit this file):

```env
# Database
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require

# Clerk
CLERK_SECRET_KEY=sk_live_...
ALLOWED_CLERK_IDS=user_abc123,user_xyz456   # comma-separated Clerk user IDs

# SendGrid
SENDGRID_API_KEY=SG.xxxxxxx
SENDGRID_FROM_EMAIL=newsletter@impacthouse.org
SENDGRID_FROM_NAME=Impact House Church

# Public URL of this backend — used in email unsubscribe links
PUBLIC_URL=https://impact-house.onrender.com

# Frontend URL — used for CORS
FRONTEND_URL=https://impact-house.vercel.app

# Twilio (add when verified)
# TWILIO_ACCOUNT_SID=ACxxxxxxx
# TWILIO_AUTH_TOKEN=your_token
# TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
```

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
```

Each script is safe to re-run (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`).

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

The public sign-up page is at `http://localhost:3000/signup.html` (or `frontend/signup.html` opened directly).

---

## Deploying to Production

### Backend → Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your GitHub repo
4. Set **Root Directory** to `backend`
5. Set **Build Command**: `npm install`
6. Set **Start Command**: `npm start`
7. Add environment variables from the list above (all non-Twilio ones)
8. Run migrations once against Neon after the first deploy:
   ```bash
   # From your local machine with DATABASE_URL set
   cd backend
   node db/migrate-clerk.js
   node db/migrate-groups.js
   node db/migrate-templates.js
   node db/migrate-public-features.js
   ```

### Frontend → Vercel

Vercel is configured automatically via `vercel.json`.  
Just push to `main` — Vercel redeploys on every push.

The Clerk publishable key is hard-coded in `frontend/index.html` (it is safe to expose).

---

## API Reference

### Public (no authentication)

| Method | Endpoint                       | Description                                      |
|--------|--------------------------------|--------------------------------------------------|
| POST   | /api/public/signup             | Self-register as a member (rate-limited: 10/hr)  |
| GET    | /api/public/unsubscribe?token= | Opt out of all messages via email footer link    |

### Members *(auth required)*

| Method | Endpoint                    | Description                                       |
|--------|-----------------------------|---------------------------------------------------|
| GET    | /api/members                | List members (search, gender, notify, group, page)|
| POST   | /api/members                | Add a member                                      |
| POST   | /api/members/bulk           | Bulk import from parsed CSV rows                  |
| PATCH  | /api/members/:id            | Edit a member                                     |
| DELETE | /api/members/:id            | Remove a member                                   |
| GET    | /api/members/groups/list    | List all groups (primary + custom)                |
| POST   | /api/members/groups         | Create a custom tag                               |
| DELETE | /api/members/groups/:id     | Delete a custom tag                               |

### Messages *(auth required)*

| Method | Endpoint                       | Description                                    |
|--------|--------------------------------|------------------------------------------------|
| GET    | /api/messages                  | Message history (channel, status, page filters)|
| POST   | /api/messages                  | Create draft / schedule / send immediately     |
| POST   | /api/messages/test             | Test send to admin's email (no DB record)      |
| GET    | /api/messages/recipient-count  | Count eligible recipients for a channel/group  |
| POST   | /api/messages/:id/send         | Promote a draft to sent                        |
| PATCH  | /api/messages/:id              | Edit a draft or scheduled message              |
| DELETE | /api/messages/:id              | Cancel a draft or scheduled message            |
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
- [ ] In-house member sign-up link (public form) ✅ done
- [ ] Token-based one-click unsubscribe ✅ done
- [ ] Bulk CSV member import ✅ done
- [ ] SendGrid event webhook → real open / delivery rates
- [ ] Multiple admin management UI (add/remove from within the app)
- [ ] External sign-up form API integration
- [ ] WYSIWYG email editor

---

Built with care for Impact House Church.

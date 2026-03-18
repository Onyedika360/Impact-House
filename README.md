# Impact House Church — Communications App

A full-stack web app for sending SMS and email newsletters to church members.

## Tech Stack

| Layer    | Technology                         |
|----------|------------------------------------|
| Frontend | HTML / CSS / Vanilla JS            |
| Backend  | Node.js + Express                  |
| Database | PostgreSQL (hosted on Neon)        |
| Deploy   | Render (API) + Vercel (Frontend)   |
| SMS      | Twilio (plug in when ready)        |
| Email    | SendGrid (plug in when ready)      |

---

## Project Structure

```
impact-house/
├── backend/
│   ├── db/
│   │   ├── index.js        # DB connection pool
│   │   └── migrate.js      # Creates all tables
│   ├── middleware/
│   │   └── auth.js         # JWT verification
│   ├── routes/
│   │   ├── auth.js         # Login / register
│   │   ├── members.js      # Member CRUD
│   │   ├── messages.js     # Compose & send
│   │   └── stats.js        # Dashboard stats
│   ├── server.js           # Express entry point
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── index.html          # Full app UI
│   └── api.js              # API client functions
├── render.yaml             # Render deploy config
├── vercel.json             # Vercel deploy config
└── README.md
```

---

## Local Development

### 1. Clone & install

```bash
git clone https://github.com/yourname/impact-house.git
cd impact-house/backend
npm install
```

### 2. Set up your database (Neon — free)

1. Go to [neon.tech](https://neon.tech) and create a free account
2. Create a new project — copy the **Connection String**
3. It looks like: `postgresql://user:pass@host/dbname?sslmode=require`

### 3. Configure environment

```bash
cp .env.example .env
# Open .env and fill in:
#   DATABASE_URL=  (from Neon)
#   JWT_SECRET=    (run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
```

### 4. Run migrations (creates tables)

```bash
npm run migrate
```

### 5. Start the API

```bash
npm run dev   # development with auto-reload
npm start     # production
```

API runs at: `http://localhost:4000`

### 6. Open the frontend

Open `frontend/index.html` directly in your browser, or serve it:

```bash
npx serve frontend
```

---

## Deploying to Production

### Backend → Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your GitHub repo
4. Set **Root Directory** to `backend`
5. Set **Build Command**: `npm install`
6. Set **Start Command**: `npm start`
7. Add environment variables:
   - `DATABASE_URL` — your Neon connection string
   - `JWT_SECRET` — a long random string
   - `NODE_ENV` — `production`
   - `FRONTEND_URL` — your Vercel URL (add after step below)
8. Deploy — your API URL will be `https://your-app.onrender.com`

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your GitHub repo
3. Set **Root Directory** to `frontend`
4. Add environment variable:
   - `ENV_API_URL` — your Render API URL + `/api`
5. Deploy

---

## API Reference

### Auth
| Method | Endpoint            | Description        |
|--------|---------------------|--------------------|
| POST   | /api/auth/register  | Create admin       |
| POST   | /api/auth/login     | Login, get token   |
| GET    | /api/auth/me        | Current admin info |

### Members
| Method | Endpoint              | Description          |
|--------|-----------------------|----------------------|
| GET    | /api/members          | List members         |
| POST   | /api/members          | Add member           |
| PATCH  | /api/members/:id      | Edit member          |
| DELETE | /api/members/:id      | Remove member        |
| GET    | /api/members/groups/list | List all groups   |

### Messages
| Method | Endpoint                    | Description           |
|--------|-----------------------------|-----------------------|
| GET    | /api/messages               | Message history       |
| POST   | /api/messages               | Send or create draft  |
| PATCH  | /api/messages/:id           | Edit draft            |
| DELETE | /api/messages/:id           | Delete draft          |
| GET    | /api/messages/:id/deliveries | Delivery report      |

### Stats
| Method | Endpoint    | Description          |
|--------|-------------|----------------------|
| GET    | /api/stats  | Dashboard numbers    |

---

## Adding SMS & Email Providers

When you're ready, open `backend/routes/messages.js` and find the `TODO` comment block. Uncomment and configure:

### Twilio (SMS)
```bash
npm install twilio
```
```env
TWILIO_ACCOUNT_SID=ACxxxxxxx
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
```

### SendGrid (Email)
```bash
npm install @sendgrid/mail
```
```env
SENDGRID_API_KEY=SG.xxxxxxx
SENDGRID_FROM_EMAIL=newsletter@impacthouse.org
SENDGRID_FROM_NAME=Impact House Church
```

---

## First-Time Login

After deploying, register your first admin account:

```bash
curl -X POST https://your-api.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Pastor Admin","email":"admin@impacthouse.org","password":"YourStrongPassword"}'
```

---

Built with care for Impact House Church.

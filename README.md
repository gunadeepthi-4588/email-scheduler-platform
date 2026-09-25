# ReachInbox Email Scheduler

A production-grade, full-stack email scheduling, queue management, and batch-dispatch system built with Node.js, Express, TypeScript, PostgreSQL (Prisma), Redis (BullMQ), and React (Vite).

---

## Overview
ReachInbox Email Scheduler provides an enterprise-ready platform for delayed email scheduling, batch recipient throttling, and dynamic hourly rate-limiting. It features an administrative BullMQ dashboard (Bull Board), PostgreSQL-backed state persistence, full-text email search, automated Slack rate-limit violation alerts, Google OAuth integration, and complete process restart resilience.

---

## Features
- **Delayed & Future Scheduling**: Precision delayed execution using Redis-backed BullMQ delayed queues (no cron jobs or polling).
- **Batch CSV Recipient Upload**: Parse and extract unique email addresses directly from CSV files with duplicate elimination.
- **Staggered Recipient Delays**: Configurable delay between successive recipient dispatches (e.g., 5 seconds between recipients) to prevent mail provider throttling.
- **Hourly Rate Limiting**: Atomic Redis counters enforce per-sender hourly limits. Over-quota emails are automatically delayed and rescheduled for the next hour with zero dropped emails.
- **BullMQ Admin Dashboard**: Live Bull Board mounted at `/admin/queues` providing real-time visibility into active, waiting, delayed, completed, and failed jobs.
- **Email History & Status Tracking**: Live dashboard separating `SCHEDULED`, `SENT`, and `FAILED` emails with delivery timestamps (`sentAt`).
- **Safe Email Cancellation**: Cancel scheduled jobs from both BullMQ and PostgreSQL while strictly protecting `SENT` email history from deletion.
- **Full-Text Search**: Search emails across recipient, sender, subject, and body with optional Elasticsearch support and automated PostgreSQL fallback.
- **Automated Slack Alerts**: Real-time webhook notifications sent to Slack when hourly sender rate limits are exceeded (with hourly deduplication).
- **Google OAuth Integration**: Clean authentication flow and user session endpoints with seamless developer fallback.
- **Crash & Restart Persistence**: Scheduled and delayed jobs survive server and worker restarts without data loss or duplicate dispatch.

---

## Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                      React + Vite UI                        │
│         (Compose, CSV Upload, Tabs, Search, Bull Board)     │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / REST
┌──────────────────────────────▼──────────────────────────────┐
│                    Express API Backend                      │
│   ├── Email Routes (/api/emails, /api/emails/search)        │
│   ├── Auth Routes (/api/auth)                               │
│   └── Bull Board UI (/admin/queues)                         │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
       Prisma  │                       BullMQ  │
┌──────────────▼──────────────┐ ┌──────────────▼──────────────┐
│     PostgreSQL Database     │ │         Redis Queue         │
│  (Users, Emails, Metadata)  │ │ ('emailQueue', Rate Limits) │
└─────────────────────────────┘ └──────────────┬──────────────┘
                                               │
                                       BullMQ  │ Worker
                                ┌──────────────▼──────────────┐
                                │     Email Queue Worker      │
                                │  - Concurrency Control      │
                                │  - Rate Limiting Guard      │
                                │  - Nodemailer (Ethereal)    │
                                │  - Status Update to DB      │
                                │  - Slack Alert on Limit     │
                                └─────────────────────────────┘
```

---

## Tech Stack
- **Backend**: Node.js, Express, TypeScript, BullMQ, IORedis, Prisma ORM, Nodemailer, @bull-board/api, @bull-board/express.
- **Frontend**: React 19, Vite, CSS3 design system.
- **Database & Queue**: PostgreSQL 16, Redis 7 Alpine.
- **Integrations**: Ethereal SMTP, Slack Webhooks, Google OAuth, Elasticsearch (optional).

---

## Project Structure
```
reachinbox-assignment/
├── docker-compose.yml              # PostgreSQL and Redis multi-container setup
├── README.md                       # Complete submission documentation
├── .gitignore                      # Root Git protection
├── backend/
│   ├── .env.example                # Safe environment variable template
│   ├── package.json                # Dependencies, build, and worker scripts
│   ├── tsconfig.json               # Backend TypeScript configuration
│   ├── prisma/
│   │   ├── schema.prisma           # Prisma models (user, Email)
│   │   └── migrations/             # Versioned database migrations
│   └── src/
│       ├── server.ts               # Express entrypoint & Bull Board mount
│       ├── config/
│       │   ├── database.ts         # PrismaClient singleton
│       │   └── redis.ts            # Shared Redis connection & client
│       ├── queues/
│       │   └── emailQueue.ts       # BullMQ 'emailQueue' instance
│       ├── workers/
│       │   └── emailWorker.ts      # BullMQ Worker implementation
│       ├── routes/
│       │   ├── emailRoutes.ts      # Scheduling, search, list, & cancel routes
│       │   └── authRoutes.ts       # Google OAuth & session management
│       └── services/
│           ├── emailService.ts     # Nodemailer transport & preview logger
│           ├── searchService.ts    # Search abstraction (ES + DB fallback)
│           └── slackService.ts     # Slack alert service with deduplication
└── frontend/
    ├── package.json                # React 19 & Vite configuration
    ├── vite.config.js              # Vite build setup
    └── src/
        ├── App.jsx                 # Dashboard component (Compose, Search, List)
        ├── App.css                 # Dashboard layout & styles
        └── main.jsx                # React application mount
```

---

## Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **Docker & Docker Compose**: For local PostgreSQL and Redis containers

---

## Environment Variables
Create a `.env` file in the `backend/` directory using placeholders:

```ini
# PostgreSQL Database Connection
DATABASE_URL="postgresql://reachinbox:reachinbox@localhost:5432/reachinbox?schema=public"

# Redis Server Configuration
REDIS_HOST="localhost"
REDIS_PORT=6379

# Server Configuration
PORT=5000
WORKER_CONCURRENCY=5

# SMTP Provider (Ethereal Email for testing)
SMTP_HOST="smtp.ethereal.email"
SMTP_PORT=587
SMTP_USER="your-ethereal-username"
SMTP_PASS="your-ethereal-password"
SMTP_FROM="your-sender-address@ethereal.email"

# Slack Notification Webhook (Optional)
SLACK_WEBHOOK_URL=""

# Google OAuth Credentials (Optional)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_CALLBACK_URL="http://localhost:5000/api/auth/google/callback"
FRONTEND_URL="http://localhost:5173"

# Elasticsearch (Optional)
ELASTICSEARCH_NODE=""
ELASTICSEARCH_API_KEY=""
```

---

## PostgreSQL + Redis Setup
Launch PostgreSQL and Redis using the included `docker-compose.yml`:
```bash
docker-compose up -d
```
Verify containers are running:
```bash
docker ps
```

---

## Installation

### Backend
```bash
cd backend
npm install
```

### Frontend
```bash
cd ../frontend
npm install
```

---

## Database Migration
Apply Prisma migrations to initialize the PostgreSQL schema:
```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

---

## Running Backend
```bash
cd backend
npm run dev
```
The server will start on `http://localhost:5000` with the BullMQ worker and Bull Board running automatically.

---

## Running Frontend
```bash
cd frontend
npm run dev
```
The client dashboard will be available at `http://localhost:5173`.

---

## Worker
The background email worker is automatically loaded inside `server.ts`. 

If you prefer to run the worker in a standalone dedicated process (for microservice architectures):
```bash
cd backend
npm run worker
```

---

## BullMQ Dashboard
Access the visual queue dashboard at:
👉 **`http://localhost:5000/admin/queues`**

Inspect:
- **Waiting Jobs**: Immediate jobs ready for dispatch.
- **Delayed Jobs**: Scheduled emails waiting for their scheduled time.
- **Active Jobs**: Jobs currently being transmitted via SMTP.
- **Completed Jobs**: Successfully delivered emails.
- **Failed Jobs**: Errored jobs with stack traces and retry controls.

---

## API Endpoints

### Email Endpoints
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/emails/send-email` | Schedule single email or batch list of recipients |
| `GET` | `/api/emails` | List all emails (optional `?status=SCHEDULED` or `?status=SENT`) |
| `GET` | `/api/emails/search?q=:query` | Full-text search across recipients, subjects, senders, and bodies |
| `DELETE` | `/api/emails/:id` | Cancel and delete a scheduled email (SENT emails protected) |

### Authentication Endpoints
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/auth/me` | Fetch active user session information |
| `GET` | `/api/auth/google` | Initiate Google OAuth authorization redirect |
| `GET` | `/api/auth/google/callback` | Exchange OAuth code for tokens |
| `POST` | `/api/auth/logout` | Terminate session |

### Diagnostic Endpoints
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | API status index & registered route summary |
| `GET` | `/db-test` | Query database connectivity |
| `GET` | `/queue-test` | Push diagnostic job to BullMQ |

---

## CSV Scheduling
1. Prepare a `.csv` file with email addresses (single column or standard comma-separated format).
2. Click **📁 Choose CSV File** in the Compose Email card.
3. The dashboard automatically cleans whitespace and removes duplicates.
4. Set **Schedule Start Date & Time**, **Delay Between Emails (seconds)**, and **Hourly Sending Limit**.
5. Click **🚀 Schedule Email**. BullMQ schedules each recipient with staggered delays:
   $$\text{Delay}_i = (\text{ScheduledAt} - \text{Now}) + (i \times \text{DelaySeconds} \times 1000)$$

---

## Rate Limiting
- Each sender email address has an isolated Redis counter: `email-rate:${fromEmail}:${YYYY-MM-DDTHH}`.
- When an email job executes:
  1. If counter $\le \text{hourlyLimit}$, email sends immediately.
  2. If counter $> \text{hourlyLimit}$, counter decrements, and the job is automatically rescheduled for the beginning of the next hour with `delay = nextHour - now`.
  3. A Slack webhook notification is triggered informing the team.
  4. **No emails are dropped or lost.**

---

## Search
- **API**: `GET /api/emails/search?q=keyword`
- **Fields searched**: `toEmail`, `fromEmail`, `subject`, `body`.
- **Elasticsearch Support**: If `ELASTICSEARCH_NODE` is configured, searches against Elasticsearch.
- **PostgreSQL Fallback**: If Elasticsearch is not configured or offline, searches PostgreSQL using case-insensitive `ILIKE` pattern matching.

---

## Google OAuth Configuration
To enable Google OAuth:
1. Go to [Google Cloud Console](https://console.cloud.google.com/) -> APIs & Services -> Credentials.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Set Authorized Redirect URI: `http://localhost:5000/api/auth/google/callback`.
4. Add the credentials to `backend/.env`:
   ```ini
   GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="your-client-secret"
   GOOGLE_CALLBACK_URL="http://localhost:5000/api/auth/google/callback"
   ```

---

## Slack Configuration
To enable Slack rate-limit violation alerts:
1. Go to your Slack Workspace -> Apps -> Incoming Webhooks.
2. Create an Incoming Webhook for your desired channel.
3. Add the Webhook URL to `backend/.env`:
   ```ini
   SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T00/B00/XXXX"
   ```
*Note: Alerts are automatically deduplicated to at most 1 notification per sender per hour.*

---

## Elasticsearch Configuration
*(Optional)* To index and search via Elasticsearch:
```ini
ELASTICSEARCH_NODE="http://localhost:9200"
ELASTICSEARCH_API_KEY="your-api-key"
```
When omitted, the system operates seamlessly using PostgreSQL.

---

## Testing
- **SMTP Testing**: Ethereal Email sandbox accounts capture all outbound emails without delivering to real inboxes.
- When an email sends, view the preview URL in backend logs:
  `Preview URL: https://ethereal.email/message/...`
- **Rate Limit Testing**: Set **Hourly Sending Limit** to `2`, schedule 4 emails with 1-second delays, and observe the 3rd and 4th emails automatically rescheduled in Bull Board for the next hour.

---

## Restart Persistence
1. Schedule an email for 10 minutes in the future.
2. Confirm the job appears under **Delayed** in `http://localhost:5000/admin/queues` and `SCHEDULED` in PostgreSQL.
3. Stop the backend server (`Ctrl + C`).
4. Restart the backend server (`npm run dev`).
5. Refresh Bull Board: the delayed job remains intact with the correct remaining delay.
6. When the scheduled time arrives, the worker processes the job and updates PostgreSQL to `SENT`.

---

## Troubleshooting
- **Redis connection error (`ECONNREFUSED 127.0.0.1:6379`)**: Ensure Redis is running via `docker-compose up -d redis`.
- **Database error (`P1001: Can't reach database server`)**: Ensure PostgreSQL container is running via `docker-compose up -d postgres`.
- **TypeScript build error**: Ensure `backend/tsconfig.json` contains `"module": "commonjs"` and `"esModuleInterop": true`.

---

## Deployment Notes
- Build production bundles:
  - Backend: `npm run build` in `backend/` -> outputs to `backend/dist/`.
  - Frontend: `npm run build` in `frontend/` -> outputs to `frontend/dist/`.
- Ensure environment variables are populated in your hosting provider (e.g. AWS, Render, Railway).
- The PostgreSQL database should run migrations via `npx prisma migrate deploy` on production initialization.

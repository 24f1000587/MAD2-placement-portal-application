# PlaceTrack

**PlaceTrack** is a campus placement portal built for the App Dev II project
(Placement Portal Application, V2). It gives an institute's placement cell,
recruiting companies, and students a single system to run campus recruitment
end-to-end — company approval, placement drives, applications, interviews,
and reporting — instead of spreadsheets and email threads.

> Built with **Flask** (API) + **VueJS 3** (UI, via CDN) + **Bootstrap 5**
> (styling) + **SQLite** (database) + **Redis & Celery** (caching + background
> jobs), exactly per the assignment's mandated stack.

---

## 1. Why "PlaceTrack" looks the way it does

The whole UI is built around one idea: an application's journey is a
**track** — Applied → Shortlisted → Interview → Selected — and that
metaphor shows up literally as a segmented "rail" component (`StatusRail`)
on every application card, and again as the hero graphic on the landing
page. Typography pairs **Space Grotesk** (headings) with **Inter** (body)
and **IBM Plex Mono** (roll numbers, IDs, dates) on a navy/amber palette —
chosen deliberately to avoid the generic "default Bootstrap blue" look.

---

## 2. Feature checklist

### Core (mandatory) features
- Unified `User` model with `role` discriminator (`admin` / `student` / `company`) — single login endpoint for everyone.
- Admin account is **pre-seeded programmatically** on first boot (`app/seed.py`) — there is no admin registration route.
- JWT-based authentication (`Flask-JWT-Extended`) with role-based access control decorators (`backend/app/utils/decorators.py`).
- Student self-registration + login, profile editing, resume upload/download.
- Company self-registration + login; profile requires **admin approval** before the company can post drives.
- Admin: approve/reject companies, approve/reject placement drives, blacklist/deactivate students & companies, global search, dashboard stats.
- Company: create drives (post-approval only), view/manage applicants, shortlist → interview → select/reject workflow.
- Student: eligibility-aware drive browsing & search, apply (duplicate-apply blocked), live application status, placement history.
- Backend jobs (Celery + Redis):
  - **(a) Daily reminders** — `app.tasks.send_daily_deadline_reminders`, Celery-beat cron, notifies eligible students of drives closing soon (Google Chat webhook, with an automatic local-log fallback so it's fully demoable offline).
  - **(b) Monthly activity report** — `app.tasks.generate_monthly_activity_report`, runs on the 1st of every month, builds a designed PDF + HTML snapshot and notifies the admin.
  - **(c) User-triggered CSV export** — `app.tasks.export_applications_csv`, triggered from the student dashboard, runs async, student is notified (in-app + log/webhook) when the file is ready to download.
- Redis caching (`Flask-Caching`) on hot read paths (open-drive listing, admin dashboard) with explicit timeouts **and** explicit invalidation on writes (approve/reject/blacklist).
- Frontend + backend validation on every form (HTML5 attributes client-side, dedicated `backend/app/utils/validators.py` server-side).

### Optional features implemented
1. **PDF reports** — the monthly activity report is rendered as a designed PDF (`backend/app/utils/pdf_generator.py`, via `fpdf2`), not just HTML.
2. **Charts (Chart.js)** — bar/doughnut charts on the student, company, and admin dashboards (application status breakdown, applicants per drive, students by branch).
3. **Dummy offer-letter generator** — once a student is marked `selected`, the company can generate a PDF offer letter (also via `fpdf2`) that the student can download from their applications page.
4. Fully responsive single UI (Bootstrap grid, one codebase for mobile & desktop).
5. In-app notification bell (extra polish, wired into every backend event above).

---

## 3. Project structure

```
placetrack/
├── backend/
│   ├── app/
│   │   ├── admin/            # Admin blueprint (approvals, moderation, reports, search)
│   │   ├── auth/              # Registration + unified login
│   │   ├── company/           # Company blueprint (drives, applicants, offer letters)
│   │   ├── student/            # Student blueprint (browse, apply, export, resume)
│   │   ├── common/            # Shared endpoints (notifications, reference data)
│   │   ├── utils/              # decorators, validators, pdf_generator, notify
│   │   ├── config.py, extensions.py, models.py, seed.py
│   │   ├── celery_app.py, tasks.py
│   │   └── __init__.py         # App factory (points Flask at ../../frontend for UI files)
│   ├── instance/                # SQLite DB, notification log, uploads, exports (created at runtime)
│   │   ├── uploads/resumes/
│   │   └── exports/{csv,reports,offer_letters}/
│   ├── requirements.txt
│   ├── run.py                   # Flask dev server entry point
│   ├── celery_worker.py         # Celery worker/beat entry point
│   └── .env.example
├── frontend/
│   ├── templates/index.html    # Jinja2 used ONLY as the CDN entry shell
│   └── static/
│       ├── css/style.css        # PlaceTrack design system (on top of Bootstrap)
│       └── js/                  # Vue 3 SPA (CDN, no build step) — api, store, router,
│                                 #  components/{common,auth,student,company,admin}.js
├── README.md
└── .gitignore
```

Backend and frontend are separate folders, but they're still one running
application: Flask (in `backend/`) is configured to read its static assets
and the single Jinja2 shell straight out of `frontend/`, so there's no
build step and no second server to run for the UI.

---

## 4. Getting it running locally

### 4.1 Prerequisites
- Python 3.10+
- Redis server (`redis-server`) reachable at `localhost:6379`
- No internet access is required at runtime **except** for the browser to
  load the CDN assets (Vue, Bootstrap, Chart.js) referenced in
  `frontend/templates/index.html`. Everything else runs fully offline/locally.

### 4.2 Setup

```bash
cd placetrack/backend
python3 -m venv venv
source venv/bin/activate        # venv\Scripts\activate on Windows
pip install -r requirements.txt

cp .env.example .env            # defaults work out of the box for a local demo
```

The SQLite database and the single Admin account are created **automatically**
the first time the app starts (`db.create_all()` + `seed_admin()` in
`app/__init__.py` / `app/seed.py`) — no manual DB tooling required. All
runtime data (the DB file, uploaded resumes, generated CSV/PDF exports, the
notification log) is written under `backend/instance/`.

### 4.3 Run the three processes (separate terminals, all from `backend/`)

```bash
# Terminal 1 — Redis (skip if you already have it running)
redis-server

# Terminal 2 — Flask app (serves both the API and the frontend/ UI bundle)
cd placetrack/backend
python run.py
# -> http://localhost:5000

# Terminal 3 — Celery worker (handles the CSV export + report jobs)
cd placetrack/backend
celery -A celery_worker.celery worker --loglevel=info
# add --pool=solo on Windows

# Terminal 4 (optional) — Celery beat (daily reminders + monthly report on schedule)
cd placetrack/backend
celery -A celery_worker.celery beat --loglevel=info
```

Open **http://localhost:5000** in your browser.

### 4.4 Demo credentials

| Role    | Email                     | Password      | Notes                                   |
|---------|----------------------------|---------------|------------------------------------------|
| Admin   | `black.thief05@gmail.com`     | `Admin@1234`  | Pre-seeded, no registration flow exists |
| Student | (register from the UI)     | —             | `/register/student`                     |
| Company | (register from the UI)     | —             | `/register/company`, needs admin approval before posting drives |

Change `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` before the **first** run if
you want different admin credentials (they only take effect the first time
the account is seeded).

### 4.5 Trying the background jobs during a demo
- **CSV export**: log in as a student → *My Applications* → *Export as CSV* (needs the Celery worker running).
- **Monthly report**: log in as admin → *Reports* → pick a month → *Generate now* (needs the Celery worker running; no need to wait for the 1st of the month).
- **Daily reminders**: run once manually without waiting for the schedule (from `backend/`, with the venv active):
  ```bash
  python -c "from app import create_app; from app.tasks import send_daily_deadline_reminders; \
  app = create_app(); ctx = app.app_context(); ctx.push(); print(send_daily_deadline_reminders())"
  ```
- With `GCHAT_WEBHOOK_URL` left empty in `.env`, every outbound notification
  is appended to `backend/instance/notifications.log` instead — open that
  file to show the examiner the reminder/report content without needing a
  live webhook.

---

## 5. API overview

All endpoints are under `/api`. Auth uses `Authorization: Bearer <JWT>`.

| Area   | Method & Path | Description |
|--------|----------------|--------------|
| Auth   | `POST /auth/register/student` | Student self-registration |
| Auth   | `POST /auth/register/company` | Company self-registration (pending approval) |
| Auth   | `POST /auth/login` | Unified login for all roles |
| Auth   | `GET  /auth/me` | Current user + profile |
| Student| `GET/PUT /student/profile`, `POST /student/profile/resume` | Profile & resume |
| Student| `GET /student/dashboard` | Stats + upcoming deadlines |
| Student| `GET /student/drives`, `GET /student/drives/:id` | Browse/search open drives (cached) |
| Student| `POST /student/drives/:id/apply` | Apply (blocks duplicates & ineligible students) |
| Student| `GET /student/applications`, `GET /student/history` | Track status / placement history |
| Student| `POST /student/export`, `GET /student/export/status/:id`, `GET /student/export/download/:file` | Async CSV export |
| Company| `GET/PUT /company/profile`, `GET /company/dashboard` | Profile & stats |
| Company| `POST/GET/PUT /company/drives` | Create/list/edit drives (post-approval) |
| Company| `GET /company/drives/:id/applicants` | Applicant list |
| Company| `PUT /company/applications/:id/status` | Shortlist → interview → select/reject |
| Company| `POST/GET /company/applications/:id/offer-letter` | Generate/download offer letter PDF |
| Admin  | `GET /admin/dashboard` | Institute-wide stats (cached) |
| Admin  | `GET/POST /admin/companies/...` | Approve/reject/blacklist/reactivate companies |
| Admin  | `GET/POST /admin/students/...` | Search, blacklist/reactivate students |
| Admin  | `GET/POST /admin/drives/...` | Approve/reject drives |
| Admin  | `GET /admin/search` | Global search across students/companies/drives |
| Admin  | `GET/POST /admin/reports/monthly/...` | List / generate-on-demand / download monthly PDF reports |
| Common | `GET /common/notifications`, `POST /common/notifications/:id/read` | In-app notification bell |

---

## 6. Database design (summary)

`User` (unified identity + role) 1—1 `StudentProfile` / `CompanyProfile`.
`CompanyProfile` 1—N `PlacementDrive` 1—N `Application` N—1 `StudentProfile`
(unique on `student_id + drive_id` to block duplicate applications).
`Notification` N—1 `User`. `MonthlyReport` is a standalone log of generated
reports. See `backend/app/models.py` for full column definitions — it's the
authoritative source for the ER diagram in the project report.

---

## 7. Notes on originality

This codebase, its data model, the "track rail" visual system, and the
copy/wording throughout were written specifically for this assignment under
the name **PlaceTrack** — it does not reuse any third-party template,
boilerplate, or starter kit.

# Transcript Management System (TMS)

Production-grade Next.js application for managing academic transcripts at higher education institutions.

---

## Quick start

```bash
# 1. Clone and install
git clone <repo>
cd tms
pnpm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local — set JWT_SECRET and DATABASE_URL at minimum

# 3. Push schema to database
pnpm db:push

# 4. Create the first SUPER_ADMIN
pnpm seed:admin --email admin@example.com --password changeme123

# 5. (Optional) Seed demo data
pnpm seed:demo

# 6. Start dev server
pnpm dev
# → http://localhost:3000
```

---

## Environment variables

| Variable               | Required       | Description                                                         |
| ---------------------- | -------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`         | **Yes**        | PostgreSQL connection string                                        |
| `JWT_SECRET`           | **Yes** (prod) | At least 32 chars. `openssl rand -base64 64`                        |
| `SUPER_ADMIN_EMAIL`    | Optional       | Creates the first admin account when no admins exist                |
| `SUPER_ADMIN_PASSWORD` | Optional       | Password for the first admin account; must be at least 8 characters |
| `SUPER_ADMIN_ROLE`     | Optional       | Defaults to `SUPER_ADMIN`                                           |

See `.env.example` for all options with comments.

---

## Tech stack

| Layer      | Choice                           | Why                                                        |
| ---------- | -------------------------------- | ---------------------------------------------------------- |
| Framework  | Next.js App Router               | Server components, server actions, Edge middleware         |
| Database   | PostgreSQL + Drizzle ORM         | Type-safe queries, schema-first migrations                 |
| Auth       | JWT via `jose` + bcrypt sessions | Edge-compatible JWT; bcrypt isolated to Node.js only       |
| PDF        | Puppeteer                        | Pixel-perfect A4 rendering from HTML                       |
| Validation | Zod                              | Runtime schema validation for all form inputs and CSV rows |
| Styling    | Tailwind CSS v3                  | Dark mode via `class` strategy                             |

---

## Architecture

### Authentication flow

```
User → POST /login
  → loginAction (server action)
    → comparePassword (bcryptjs, Node.js only)
    → signToken (jose, Edge-safe)
    → createSession → sets httpOnly cookie "tms_session"

Every subsequent request:
  → middleware.ts (Edge Runtime)
    → verifyToken (jose)
    → enforces PROTECTED_PREFIXES + SUPER_ADMIN_PREFIXES
    → silently refreshes token if expiring within 2h
    → injects x-invoke-path header for breadcrumb

Server component / server action:
  → requireAuth() / requirePermission() / assertPermission()
    → second enforcement layer (defence-in-depth)
```

**Three-layer enforcement:**

1. Middleware (Edge) — redirect before page executes
2. Layout RSC — `requireAuth()` runs on every layout render
3. Page/action — `requirePermission()` checks the specific capability

### GPA calculation

```
grades row stores:
  grade_point            (resolved from grade letter at write time)
  credit_hours           (snapshot from courses.credit_hours)
  computed_quality_points = grade_point × credit_hours  (computed at write time)

GPA query (never per-row JS):
  SELECT
    SUM(computed_quality_points),
    SUM(CASE WHEN is_resit THEN credit_hours * 2 ELSE credit_hours END),
    SUM(CASE WHEN grade NOT IN ('E', 'IC')
      THEN CASE WHEN is_resit THEN credit_hours * 2 ELSE credit_hours END
      ELSE 0 END)
  FROM grades g
  INNER JOIN courses c ON g.course_id = c.id AND c.is_scoring = true
  WHERE g.student_id = $1
  GROUP BY g.semester_id

Resit quality points remain `grade_point × actual credit_hours`; only the
attempted and earned credits are doubled.

CGPA = sumSemesters(semester rows) — O(semesters), not O(grade rows)
```

**Key invariants:**

- `gradePoint` and `computedQualityPoints` are **never accepted from client** — always server-computed
- The partial unique index `WHERE is_superseded = false` enforces one active grade per (student, course, semester)
- Grade corrections create a new row and set the old row's `is_superseded = true` in a transaction

### Bulk upload pipeline

```
CSV file → parseGradeCSV / parseStudentCSV    (RFC 4180 parser, zero deps)
         → validateGradeBatch / validateStudentBatch
              ↳ 4 pre-fetch queries → Maps for O(1) per-row lookup
              ↳ Zod field validation
              ↳ Entity existence check
              ↳ Duplicate check (DB + within-batch)
              ↳ Server-side gradePoint/creditHours computation
         → runGradeBulkInsertPipeline
              ↳ Per-row inserts (not multi-row) — row-level error recovery
              ↳ Race-condition duplicates caught and returned as row failures
         → GradeBulkResult { totalRows, successCount, failureCount, failures[] }
```

### Transcript generation

```
generateTranscript(studentId, adminId, headers)
  │
  ├── assembleTranscript(studentId)
  │     ├── [parallel] student+programme, institution, registrar
  │     ├── [parallel] queryCGPAAggregatesBySemester (SQL aggregation)
  │     └── [parallel] fetchStudentGradeRows (display rows)
  │           → merge by semesterId → TranscriptObject
  │
  ├── stamp: transcriptNumber, generatedAt, generatedByAdminId
  ├── computeTranscriptChecksum (SHA-256 over academic payload)
  ├── INSERT INTO transcripts (retry up to 3× on number collision)
  └── logAuditEvent (full academic snapshot — permanent record)

Then in server action:
  ├── renderTranscriptHtml(transcript) → HTML string
  ├── renderHTMLToPDF(html)            → { bytes, checksum, sizeBytes }
  └── writeTranscriptFile(fileKey, bytes) → .transcripts/ or S3
```

---

## Folder structure

```
tms/
├── .env.example               ← copy to .env.local
├── next.config.ts             ← body size limit, security headers, server externals
├── tailwind.config.ts         ← darkMode: "class", animations
├── drizzle.config.ts          ← schema path, migrations output
├── middleware.ts               ← Edge: auth guards + x-invoke-path header
│
├── app/
│   ├── layout.tsx             ← root: suppressHydrationWarning, dark mode init script
│   ├── globals.css            ← Tailwind, print rules, toast animation
│   ├── not-found.tsx
│   ├── (auth)/login/          ← unauthenticated
│   ├── (app)/                 ← all routes behind auth
│   │   ├── layout.tsx         ← AppShell + ToastProvider + requireAuth
│   │   ├── dashboard/
│   │   ├── students/          ← CRUD + search
│   │   ├── programmes/        ← CRUD
│   │   ├── courses/           ← CRUD + scoring toggle
│   │   ├── semesters/         ← create/delete grouped by year
│   │   ├── grades/            ← student search → entry + table
│   │   ├── transcripts/       ← list + student search
│   │   │   └── [studentId]/   ← preview + action bar + history
│   │   ├── bulk/
│   │   │   ├── upload/        ← student CSV
│   │   │   └── grades/        ← grade CSV
│   │   ├── templates/         ← download hub
│   │   ├── audit/             ← ADMIN+ only, filter + diff viewer
│   │   └── admin/             ← SUPER_ADMIN only
│   └── api/
│       ├── bulk/upload/        ← POST student CSV
│       ├── bulk/grades/upload/ ← POST grade CSV
│       ├── templates/students/ ← GET template with BOM+CRLF
│       ├── templates/grades/   ← GET template with BOM+CRLF
│       └── transcript/[id]/    ← GET stream PDF
│
├── actions/
│   ├── auth.ts                ← loginAction, logoutAction
│   ├── transcripts.ts         ← generateTranscriptAction
│   └── crud/                  ← createXAction, updateXAction, deleteXAction per entity
│
├── components/
│   ├── ui/index.tsx           ← Toast, Modal, Button, Table, Badge, Field, Input...
│   └── layout/app-shell.tsx   ← sidebar, dark mode, breadcrumb, mobile drawer
│
├── lib/
│   ├── auth/                  ← config, jwt (jose), passwords (bcrypt), rbac, session
│   ├── gpa.ts                 ← re-export barrel → lib/gpa/ (TS resolution fix)
│   ├── gpa/                   ← queries (SQL agg), compute, scale, types
│   ├── transcript/            ← assembler, generator, checksum, types
│   ├── bulk/                  ← student: parser, validator, pipeline, report
│   ├── bulk/grades/           ← grade: parser, validator, pipeline, report
│   ├── pdf/                   ← generator (Puppeteer), template (HTML→TranscriptObject)
│   ├── templates/             ← CSV template generators (BOM+CRLF)
│   ├── audit.ts               ← logAuditEvent, extractRequestMeta
│   ├── audit-log.ts           ← queryAuditRows, queryAuditStats, classification
│   └── actions/utils.ts       ← parseDbError, withAction
│
├── db/
│   ├── index.ts               ← Drizzle + Neon HTTP client
│   ├── schema.ts              ← all tables, enums, indexes
│   └── migrations/
│       └── 0001_initial.sql   ← complete schema DDL
│
├── types/
│   └── auth.ts                ← Role, SessionPayload, AuthenticatedAdmin, ActionState
│
└── scripts/
    ├── seed-admin.ts          ← create first SUPER_ADMIN
    └── seed-demo.ts           ← seed institution, courses, students, grades
```

---

## Permission matrix

| Permission             | SUPER_ADMIN | ADMIN | VIEWER |
| ---------------------- | :---------: | :---: | :----: |
| `manage_users`         |      ✓      |       |        |
| `manage_institution`   |      ✓      |       |        |
| `manage_registrar`     |      ✓      |       |        |
| `manage_programmes`    |      ✓      |   ✓   |        |
| `manage_students`      |      ✓      |   ✓   |        |
| `manage_courses`       |      ✓      |   ✓   |        |
| `enter_grades`         |      ✓      |   ✓   |        |
| `bulk_upload`          |      ✓      |   ✓   |        |
| `generate_transcripts` |      ✓      |   ✓   |        |
| `view_transcripts`     |      ✓      |   ✓   |   ✓    |
| `view_grades`          |      ✓      |   ✓   |   ✓    |
| `view_audit_logs`      |      ✓      |   ✓   |        |

---

## Production checklist

```
☐ Set JWT_SECRET to a ≥32-char random value
☐ Set DATABASE_URL to your production PostgreSQL connection string
☐ Run pnpm db:migrate (do NOT use db:push in production)
☐ Create at least one SUPER_ADMIN via pnpm seed:admin
☐ Add at least one institution record via /admin/institution
☐ Add at least one registrar via /admin/registrar
☐ For Vercel: swap puppeteer for puppeteer-core + @sparticuz/chromium
☐ For S3 PDF storage: implement writeTranscriptFile in actions/transcripts.ts
☐ Remove PUPPETEER_EXECUTABLE_PATH from env if using @sparticuz/chromium
☐ Confirm tailwind.config.ts has darkMode: "class"
☐ Confirm app/layout.tsx has suppressHydrationWarning on <html>
☐ Set NODE_ENV=production in your deployment environment
```

---

## Self-hosted PostgreSQL (non-Neon)

Replace `db/index.ts`:

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
```

```bash
pnpm remove @neondatabase/serverless drizzle-orm
pnpm add postgres drizzle-orm
```

Update `drizzle.config.ts` dialect: still `"postgresql"` — no change needed.

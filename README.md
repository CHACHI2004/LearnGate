# LearnGate

LearnGate is a full-stack learning management system for faculty-led courses. Faculty create subjects and sequential lessons, build and publish quizzes, generate editable quiz drafts from PDF/PPTX documents, and review student progress. Students enroll, complete lessons and timed quizzes, and track their scores. Administrators manage users and faculty approvals.

## Stack

- **Client:** React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, Recharts
- **API:** Node.js 20.19+, Express 5, TypeScript
- **Database:** MongoDB with Mongoose
- **Integrations:** Cloudinary uploads, Brevo email, Groq quiz and flashcard generation

## Requirements

- Node.js `>=20.19.0` and npm
- MongoDB locally or a MongoDB Atlas database
- Optional provider credentials for Cloudinary, Brevo email, and an AI provider

## Local development

From the repository root:

1. Install the workspace dependencies:

   ```sh
   npm ci
   ```

2. Copy `server/.env.example` to `server/.env` and optionally copy `client/.env.example` to `client/.env`. Configure at least:
   - `MONGODB_URI` (your Atlas connection string for a cloud cluster, or a local MongoDB URI)
   - `MONGODB_DATABASE` (defaults to `learngate`; this selects the database even if the URI names another database)
   - `JWT_SECRET` (at least 32 characters)
   - `CLIENT_URL` and `CLIENT_URLS` (normally `http://localhost:5173`)

   Never commit `.env` files or put server secrets in a `VITE_*` variable. The client environment file is public build-time configuration.

3. Start the API and Vite client from the project root:

   ```sh
   npm run dev
   ```

   The command waits for the API health check before starting Vite, then opens LearnGate at `http://localhost:5173`. Use this as the only address for the app. In development, browser API requests use the same origin and Vite forwards `/api` to the backend at `http://127.0.0.1:5000`, avoiding browser cross-origin/CORS issues. The API health check is available at `http://localhost:5173/api/v1/health`.

   At API startup, LearnGate connects to `MONGODB_DATABASE` and initializes its Mongoose model collections and indexes, so the database and collections appear in Atlas without running the demo seed. To see them in MongoDB Atlas, `MONGODB_URI` must point to your Atlas cluster; a local MongoDB URI creates them only on your computer. Both services and MongoDB must still be running for sign-in and database features. If the API or database is unavailable, the app cannot complete those operations; the same-origin proxy removes a common source of browser network errors but cannot mask an actual server/database outage. Do not open the API port as the web app.

4. Seed sample data in a development database (optional):

   ```sh
   npm run seed
   ```

   The seed command requires `NODE_ENV=development`, includes an explicit confirmation flag, and upserts sample users, a subject, lessons, quizzes, attempts, enrollments, and progress. It does not delete records, but it resets the passwords for its fixed demo email accounts each time it runs. The local-only default password is `LearnGate-Dev-Only-2026!`; set `SEED_PASSWORD` to a private password before running it if desired. Seed accounts are `faculty@learngate.example`, `student@learngate.example`, `student2@learngate.example`, and `admin@learngate.example`.

## Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | Run API and web client, then open the app in your browser |
| `npm run dev:server` | Run only the API with watch mode |
| `npm run dev:client` | Run only the Vite client |
| `npm run typecheck` | Typecheck both workspaces |
| `npm test` | Run the server validation, quiz, extraction, and report tests |
| `npm run build` | Build the API and production client |
| `npm run seed` | Explicitly seed the development database |

## Configure optional integrations

### Email and quiz-result notifications (Brevo)

For local development only, set `MAILTRAP_HOST=sandbox.smtp.mailtrap.io`, `MAILTRAP_PORT=2525`, `MAILTRAP_USER`, and `MAILTRAP_PASS` from a Mailtrap Email Sandbox inbox. In Mailtrap, open **Email Testing → Inboxes → your inbox → SMTP Settings** to get the username and password. When `NODE_ENV=development`, emails are captured in that sandbox instead of being delivered to users. These settings are ignored in production; do not add them to Render.

For production, set `BREVO_API_KEY` and `MAIL_FROM` on the Render API service. Create an API key in Brevo and verify the sender address (and sending domain, if applicable) in Brevo before sending. `MAIL_FROM` accepts either a bare address such as `no-reply@example.com` or a formatted sender such as `LearnGate <no-reply@example.com>`. Production emails are sent through Brevo's HTTPS transactional email API. Account registration, verification, password recovery, and quiz-result emails depend on working credentials. When a student submits a quiz, the result is emailed separately to the student and the faculty member who owns that class. Never expose provider credentials to the client.

### File storage (Cloudinary)

Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the server environment. Upload credentials are server-only. Configure Cloudinary upload and delivery policies for the file types and size limits required by your deployment. Existing application upload validation still applies.

### AI quiz and flashcard generation

Create an API key in the [Groq Console](https://console.groq.com/keys), then set `AI_PROVIDER=groq`, `GROQ_API_KEY`, and optionally `GROQ_MODEL` in `server/.env`. The default model is `openai/gpt-oss-20b`. Keep the key server-side; never put it in a `VITE_*` variable. Groq usage is subject to account rate and token limits; free access is not unlimited.

The feature supports text-based PDF and PPTX quiz sources; image-only/scanned PDFs are not OCR-processed. Flashcards support legacy `.ppt` and `.pptx` files. Monthly generation caps, request rate limits, and document size limits are configurable with `AI_MONTHLY_GENERATION_CAP`, `AI_RATE_LIMIT_WINDOW_MS`, `AI_RATE_LIMIT_MAX`, and `DOCUMENT_MAX_SIZE_MB`. AI output is validated and presented as an editable draft; faculty should review it before saving or publishing. Text in source documents is treated as untrusted content and is never followed as instructions.

### Server environment variables

`server/.env.example` documents the complete server configuration, including runtime/API settings, MongoDB, JWT and cookies, CORS origins, faculty access codes, Brevo, Cloudinary, Groq settings, and quiz defaults. `client/.env.example` documents the public client API base URL and app name.

## Deployment

For a complete Render deployment, follow [docs/deployment-render.md](./docs/deployment-render.md); the root `render.yaml` defines the API and static client services. For a Vercel frontend with a separately hosted long-running API, see [docs/deployment-vercel.md](./docs/deployment-vercel.md). Production requires HTTPS, a production MongoDB URI, a strong JWT secret, correct CORS origins, and working email delivery. Keep all provider credentials in the API host’s secret/environment settings.

## Application features

- Role-aware student, faculty, and admin workspaces
- Email verification, secure cookie-based sessions, password recovery, faculty approval, and user administration
- Faculty subjects, enrollments, sequential topics, rich lesson content, and file attachments
- Quiz authoring, CSV/XLSX/pasted question import, timed attempts, autosave, server-side grading, retakes, and answer review
- PDF/PPTX AI quiz generation with page/slide references, validated output, async job status, and faculty draft review
- PowerPoint study flashcards for `.ppt` and `.pptx`, with generated slide citations, editable saved decks, and a flip-card study mode
- Faculty analytics for topic scores, score distributions, progress, and per-student matrices, including print, PDF, and Excel exports
- Light/dark theme, responsive layouts, collapsible workspace navigation, and reduced-motion support

## Security and operations notes

- Use unique, randomly generated `JWT_SECRET` values; never reuse sample or development credentials in production.
- Allow only trusted browser origins with `CLIENT_URL`/`CLIENT_URLS`. Do not use wildcard origins with cookie authentication.
- Production cookies need HTTPS (`COOKIE_SECURE=true`). When the client and API are deployed on different hosts, use a custom domain arrangement that permits the browser’s credentialed cookies; refer to the deployment guide.
- AI processing jobs run in the API process and are marked failed after a restart. For high-volume production, move job processing to a durable queue and worker before horizontally scaling the API.
- Back up MongoDB and apply least-privilege access to database and provider credentials.

## Project layout

```text
client/       React application
server/       Express API, Mongoose models, services, and tests
docs/         Deployment and operations guides
vercel.json   Static client build and SPA fallback for Vercel
```

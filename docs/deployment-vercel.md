# Deploy LearnGate with Vercel

This deployment uses **Vercel for the static React/Vite client** and a **long-running Node.js host for the Express API**. The API starts asynchronous AI generation work inside the server process, so do not deploy it as a short-lived serverless function without first moving that work to a durable queue/worker.

## 1. Prepare production services

1. Create a production MongoDB database (MongoDB Atlas is suitable). Create a database user with access only to the LearnGate database and configure network access for the API host.
2. Create a long-running Node.js web service from this repository (for example, on Render or Railway):
   - Runtime: Node.js 20.19 or later.
   - Build command: `npm ci && npm run build --workspace server`
   - Start command: `npm run start --workspace server`
   - Health check path: `/api/v1/health`
3. Add a custom domain for the client and API under the same registered domain where possible, such as `learn.example.com` and `api.example.com`. Browsers increasingly restrict third-party cookies between unrelated hosting domains; a same-site custom domain is preferred for the app’s credentialed, HTTP-only session cookie.

## 2. Configure API environment

Set these variables in the API host’s secret/environment settings, not in Vercel client variables:

- `NODE_ENV=production`
- `PORT` (use the platform-provided port if required by the host)
- `API_PREFIX=/api/v1`
- `MONGODB_URI` (production MongoDB connection string)
- `JWT_SECRET` (random secret at least 32 characters; generate a unique value)
- `JWT_EXPIRES_IN=1d` (or your chosen duration)
- `COOKIE_NAME=learngate_session`
- `COOKIE_SECURE=true`
- `CLIENT_URL=https://learn.example.com`
- `CLIENT_URLS=https://learn.example.com` (comma-separated exact trusted origins if there are additional production client origins)
- `MAILTRAP_HOST`, `MAILTRAP_PORT`, `MAILTRAP_USER`, `MAILTRAP_PASS`, and `MAIL_FROM` for production-capable SMTP delivery
- Optional integrations: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `AI_PROVIDER=groq`, `GROQ_API_KEY`, and `GROQ_MODEL`

Set `COOKIE_DOMAIN=.example.com` only if you deliberately need the cookie shared across subdomains. Otherwise leave it unset. Use HTTPS for both client and API. Do not put server secrets in `VITE_*` variables or commit them to the repository.

Before enabling public sign-up, decide how faculty accounts will be approved. `FACULTY_ACCESS_CODE` may optionally allow registration with a code; otherwise faculty accounts require administrator approval.

## 3. Configure the Vercel frontend

1. Import the repository into Vercel and keep the project root at the repository root.
2. `vercel.json` configures the npm workspace install, client build, `client/dist` output, and SPA route fallback.
3. Set the Vercel build environment variable:

   ```text
   VITE_API_BASE_URL=https://api.example.com/api/v1
   ```

   `VITE_API_BASE_URL` is public client configuration; it must contain no secret.
4. Add the final Vercel custom domain as an exact origin in both API variables `CLIENT_URL` and `CLIENT_URLS`, then redeploy the API if those values changed.

For Vercel preview deployments, add each trusted preview origin to `CLIENT_URLS` (comma-separated) only if those previews should be allowed to authenticate. Avoid accepting arbitrary preview origins for production accounts.

## 4. Verify production

1. Open `https://api.example.com/api/v1/health` and confirm the API reports `status: "ok"`.
2. Open the Vercel app and test account registration, email verification, login/logout, and a protected API request. Confirm the session cookie is HTTP-only, secure, and sent with credentialed requests.
3. Test subject creation/enrollment, lesson and quiz workflows, and faculty reports with non-production test accounts.
4. Test SMTP delivery, Cloudinary uploads, and Groq generation only when those providers are configured. Do not use real student data for deployment smoke tests.
5. Confirm logs contain no secrets and database backups are enabled.

## Updating

Deploy client changes through Vercel and API changes through the Node service. Keep the two environments’ API URL and trusted CORS origins synchronized. Avoid running the development seed against production; the seed command refuses non-development `NODE_ENV`, but still verify the database URI before running any database maintenance command.

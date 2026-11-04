# Deploy LearnGate with Render

The Render Blueprint in `render.yaml` creates an Express API web service and a
static React/Vite site. The API runs as a long-lived Node.js service because
quiz and flashcard generation jobs run in the API process.

## Before deploying

1. Push the project to a private GitHub repository. Confirm `.env` files and
   credentials are not tracked; `.gitignore` excludes `.env` and `.env.*`.
   If a secret was ever committed, rotate it even if the commit is later removed.
2. Create a production MongoDB database, such as MongoDB Atlas. Configure its
   network access to permit connections from Render and create a database user
   limited to the LearnGate database.
3. Keep the Cloudinary, Groq, Brevo, database, and JWT credentials private.
   Never enter server secrets in a `VITE_*` variable.

## Create the Render services

1. In Render, choose **New → Blueprint** and connect the GitHub repository.
   Render will read `render.yaml` and create `learngate-api` and
   `learngate-client`. The build commands install development dependencies
   because TypeScript, Vite, and type declarations are needed to compile.
2. Set the API service's `MONGODB_URI` to the production connection string.
   The Blueprint generates a unique `JWT_SECRET`.
3. After the services are created, copy their Render URLs and set:
   - API `CLIENT_URL` and `CLIENT_URLS`: the exact client origin, for example
     `https://learngate-client.onrender.com` (no trailing slash).
   - Client `VITE_API_BASE_URL`: the API URL plus `/api/v1`, for example
     `https://learngate-api.onrender.com/api/v1`.
4. Add Cloudinary credentials to enable file uploads, Groq credentials for AI
   generation, and Brevo settings for account and quiz-result emails. Set
   `BREVO_API_KEY` and `MAIL_FROM`; verify the sender address in Brevo first.
   The API sends email over HTTPS, which works on Render's Free plan where
   outbound SMTP ports are blocked. Do not add local `MAILTRAP_*` sandbox
   credentials to Render.
5. Redeploy the API after changing API environment variables and redeploy the
   static site after changing `VITE_API_BASE_URL`; Vite embeds that value at
   build time.

The web service health check is `/api/v1/health/ready`; it requires a working
MongoDB connection. The static-site rewrite sends client-side routes to
`index.html`.

## Cookies and custom domains

The app uses an HTTP-only session cookie and credentialed API requests. For
reliable browser behavior, configure custom domains on the same registered
domain, such as `learn.example.com` and `api.example.com`. Set
`COOKIE_DOMAIN=.example.com` only when the cookie must be shared between those
subdomains. The Render-provided hostnames are suitable for initial testing,
but browser privacy settings may restrict cookies across unrelated sites.

## Verify the deployment

1. Visit `https://<api-host>/api/v1/health/ready`; expect a successful response
   with the database reported as readable.
2. Open the client URL and test registration, email verification, sign-in,
   sign-out, and a protected request.
3. With test accounts, verify enrollment, lesson attachments, quiz retakes,
   report exports, and configured integrations.
4. Review Render logs for startup errors. Do not use real student information
   for smoke tests, and enable database backups before production use.

Render's free web-service plan can sleep while idle; expect a cold start when it
wakes. AI jobs run in the API process and are marked failed after a restart, so
use a durable worker/queue before scaling or relying on long-running production
jobs.

# ProofMatch

An English, evidence-grounded job preparation workspace. Includes a responsive frontend, a Python HTTP backend, account-isolated SQLite persistence, working registration/login, simulated Pro subscriptions, editable prompts, an OpenAI-compatible AI adapter, and a Greenhouse company job-board adapter.

## Run locally

```sh
git clone https://github.com/y-neline/proofmatch.git
cd proofmatch
cp .env.example .env
python3 -m backend.server
```

Open **http://localhost:8000**. Python 3.9+ is required. No Node build or mandatory Python dependencies are needed. For PDF and DOCX import, use the virtual environment with document readers:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 -m backend.server
```

Edit `.env` with your own configuration, then restart the server:

| Variable | Purpose |
| --- | --- |
| `AI_API_KEY` | Your model provider's secret API key |
| `AI_BASE_URL` | OpenAI-compatible base URL, ending in `/v1` where required |
| `AI_MODEL` | A chat model that supports JSON-object responses |
| `GREENHOUSE_BOARD` | A target company's public Greenhouse board slug |
| `PORT` | Local server port, default 8000 |

The AI adapter uses `/chat/completions` with `response_format: json_object`. Adapt `backend/services/ai.py` if your provider uses a different contract. Secrets are never included in frontend configuration responses. Résumé data is never sent to Greenhouse.

## Structure and customization

```text
frontend/
  index.html          Application shell and navigation
  styles.css          Theme, layouts, responsive and print styles
  js/
    app.js            Page renderers, state, forms, and feature actions
    api.js            Backend request adapter
    account.js        Login, registration, pricing, paywall and demo checkout views
    data.js           Clearly labeled sample fixtures
backend/
  server.py           HTTP routing, static assets, environment loading
  services/
    ai.py             Provider adapter and prompt loading
    jobs.py           Greenhouse adapter and normalization
    documents.py      PDF / DOCX / TXT text extraction
    resume.py         Resolve AI line references to untouched source passages
    store.py          SQLite connection and legacy workspace
    auth.py           Password hashing, sessions, user workspaces and demo Pro access
  prompts/
    system.md         Shared evidence and truthfulness rules
    parse.md          Extraction contract
    rewrite.md        Three expression variants
    paths.md          Career direction suggestions
    analyze.md        JD-to-experience comparison
    train.md          Four practice types and weighted tasks
    feedback.md       Criteria-based answer review and follow-up
```

Change CSS tokens at the top of `styles.css` to restyle the app. Each page has a named rendering function in `app.js`. Each model operation has its own prompt file with an explicit JSON contract. Shared rules are prepended to every task prompt.

## Included flow

1. Choose either file upload or pasted text. Uploading a text PDF, DOCX, or TXT automatically extracts its contents and calls AI analysis; pasted text uses Analyze résumé. You can also manually add experience. Original text remains available. Extracted items are unconfirmed; the model selects source line IDs and the server copies exact source passages. Invalid entries are retained for review without blocking valid ones; raw analysis is preserved in the workspace. Identical source statements are skipped as duplicates.
2. Edit and confirm facts. Source provenance is distinct from user confirmation; neither is platform verification.
3. Explore career directions and save search preferences, including manually specified authorization.
4. Search the configured company's live Greenhouse postings, or paste a full JD. Follow the source link to apply at any stage.
5. Compare requirements with confirmed experience, preserving exact JD quotes and required/preferred distinctions.
6. Generate concise, role-specific, and interview variants. Save immutable résumé, job, and training plan snapshots. Export TXT or print to PDF.
7. Generate experience, knowledge, practical, and scenario tasks. Submit answers for model review, receive targeted feedback, then attempt a different independent follow-up when needed.
8. Applications tracking has been removed. Follow the original job link to apply externally.

Progress is calculated in code as completed task weights divided by total task weights. Only a configured AI review that explicitly meets criteria marks a task complete. This is model-reviewed preparation, not independent skill verification. Code submissions are not executed. The interface states these limitations.

## Demo behavior and limitations

Without keys, the application is still navigable and editable. New accounts start with an empty experience library. Example jobs remain clearly labeled. Demo extraction retains input as one unconfirmed card; demo rewriting preserves original text; demo feedback never pretends to assess correctness or awards completion. Career and training examples are illustrative and should be regenerated with a configured model for your own data. Use **Your workspace → Reset workspace** to start fresh. On the first registration only, the existing legacy device workspace is copied into that first account, preserving earlier local work; later accounts never receive it.

This development server is bound to loopback. Accounts use PBKDF2-HMAC-SHA256 password hashes, revocable 30-day HttpOnly SameSite=Lax session cookies, isolated workspaces and a basic authentication-attempt limiter. Before public production use, replace the development HTTP server, enable HTTPS and COOKIE_SECURE=1, and add email verification, password recovery, durable storage, stronger rate limiting and operational monitoring. Database contents are local and unencrypted. Google Fonts are optional; system fallbacks work offline. Only one company Greenhouse board is supported; no global job coverage is claimed. Scanned PDFs/images require external OCR. Complex duplicate reconciliation, automatic job polling, O*NET integration, voice interviews, and sandboxed code execution are future work. API failures remain visible and do not mark jobs closed. Missing deadlines stay unknown. Changing experience or the selected role clears dependent analysis, rewrites, and training; saved snapshots remain intact.

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/config` | Public connection flags, no credentials |
| GET / POST | `/api/workspace` | Read / save the signed-in user’s workspace |
| POST | `/api/auth/register` | Create an account and session |
| POST | `/api/auth/login` | Check password and create a session |
| POST | `/api/auth/logout` | Revoke the current session |
| GET | `/api/auth/me` | Session, plan and expiry (no password or token) |
| POST | `/api/billing/demo-checkout` | Simulate Pro activation; accepts only billing email |
| POST | `/api/import` | `{name, content}` (base64 file) → extracted text |
| GET | `/api/jobs?q=...` | Search configured Greenhouse board |
| POST | `/api/ai/{task}` | Execute a whitelisted prompt task |

## Checks

```sh
python3 -m unittest discover -s tests -v
node --input-type=module --check < frontend/js/app.js
node --experimental-default-type=module tests/frontend-smoke.mjs
```

## Accounts and plans

Open the app and create a free account. Registration and login are real local backend operations. Passwords are salted and hashed; raw passwords are never stored. Signing out revokes the session. User workspaces are keyed by account ID. The first account on an existing installation receives a copy of the old local workspace; this migration never exposes that workspace to later accounts.

- **Free:** My Experience, PDF/DOCX/TXT import, AI résumé parsing, Career Paths, Job Matches, and JD comparison. No payment card is needed.
- **Pro, $9.90/month (simulated):** all Free features plus Résumé Studio, versions/exports, Training Studio, generated plans, feedback and follow-ups. Entitlements are enforced by backend account state; changing workspace JSON does not unlock Pro.
- **Checkout:** choose Plans & Billing → Unlock all features. Click Use test card or enter `4242 4242 4242 4242`, expiry `12/30`, CVC `123`. Only the billing email reaches the server. Card fields are neither transmitted nor stored, and real card details are rejected by the UI. The endpoint itself rejects any card fields.
- **No real billing:** no provider, charge, automatic renewal, invoice or actual recurring subscription exists. The success button grants one calendar month of demo access. Repeated clicks during an active period do not stack months. Expiry relocks paid features while preserving the saved paid data for a later reactivation.

Paid AI endpoints (`rewrite`, `train`, `feedback`) return 403 for Free accounts. Anonymous workspace/import/job/AI requests return 401. All content requests use the session cookie; API secrets stay on the server.

# ProofMatch

An English, evidence-grounded job preparation workspace. Includes a responsive frontend, a Python HTTP backend, SQLite persistence, editable prompts, an OpenAI-compatible AI adapter, and a Greenhouse company job-board adapter.

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
    data.js           Clearly labeled sample fixtures
backend/
  server.py           HTTP routing, static assets, environment loading
  services/
    ai.py             Provider adapter and prompt loading
    jobs.py           Greenhouse adapter and normalization
    documents.py      PDF / DOCX / TXT text extraction
    resume.py         Resolve AI line references to untouched source passages
    store.py          SQLite workspace persistence
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
8. Track applications, statuses, and interview dates with submitted version snapshots.

Progress is calculated in code as completed task weights divided by total task weights. Only a configured AI review that explicitly meets criteria marks a task complete. This is model-reviewed preparation, not independent skill verification. Code submissions are not executed. The interface states these limitations.

## Demo behavior and limitations

Without keys, the application is still navigable and editable. Sample people and jobs are clearly marked as examples. Demo extraction retains input as one unconfirmed card; demo rewriting preserves original text; demo feedback never pretends to assess correctness or awards completion. Career and training examples are illustrative and should be regenerated with a configured model for your own data. Use **Your workspace → Reset workspace** to start fresh.

This is a local, single-user MVP bound to loopback. Do not expose it as a multi-user production service without authentication, per-user storage, HTTPS, rate limits, upload hardening, and operational monitoring. Database contents are local and unencrypted. Google Fonts are optional; system fallbacks work offline. Only one company Greenhouse board is supported; no global job coverage is claimed. Scanned PDFs/images require external OCR. Complex duplicate reconciliation, automatic job polling, O*NET integration, voice interviews, and sandboxed code execution are future work. API failures remain visible and do not mark jobs closed. Missing deadlines stay unknown. Changing experience or the selected role clears dependent analysis, rewrites, and training; saved snapshots remain intact.

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/config` | Public connection flags, no credentials |
| GET / POST | `/api/workspace` | Read / save local workspace |
| POST | `/api/import` | `{name, content}` (base64 file) → extracted text |
| GET | `/api/jobs?q=...` | Search configured Greenhouse board |
| POST | `/api/ai/{task}` | Execute a whitelisted prompt task |

## Checks

```sh
python3 -m unittest discover -s tests -v
node --input-type=module --check < frontend/js/app.js
node --experimental-default-type=module tests/frontend-smoke.mjs
```

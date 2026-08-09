# Marginalia — AI Code Review Assistant

A full-stack app that reviews pasted code or uploaded files in two stages:

1. **Static analysis** — a lightweight built-in linter flags syntax red flags,
   unused-looking variables, style/formatting issues, and common security smells
   (JavaScript/TypeScript and Python are the most fully covered languages).
2. **AI review** — the code (plus the static findings) is sent to Claude, which
   returns bugs, code smells, naming suggestions, performance ideas, refactoring
   suggestions, a plain-language explanation, and auto-generated documentation.

Every review is saved to history so you can revisit it later.

Out of scope for this build (per the project brief): GitHub repository import /
GitHub API integration. Only pasted snippets and direct file uploads are supported.

## Project structure

```
ai-code-review-assistant/
├── backend/                 Node.js + Express API
│   ├── server.js
│   ├── routes/review.js
│   ├── services/
│   │   ├── staticAnalysis.js   Stage 1
│   │   ├── aiReview.js         Stage 2 (Anthropic API)
│   │   └── db.js               JSON-file history store
│   ├── data/history.json       created automatically
│   └── .env.example
└── frontend/                 Plain HTML/CSS/JS (no framework, no inline styles)
    ├── index.html
    ├── css/style.css
    └── js/app.js
```

## Running it

**Backend**

```bash
cd backend
npm install
cp .env.example .env
# edit .env and add your ANTHROPIC_API_KEY
npm start
```

This starts the API at `http://localhost:4000` and also serves the `frontend`
folder as static files, so opening `http://localhost:4000` in a browser is
enough to use the whole app.

**Frontend only (optional)**

If you'd rather run the frontend separately (e.g. with VS Code's Live Server),
just open `frontend/index.html` — `js/app.js` will call the backend at
`http://localhost:4000` automatically. Make sure the backend is running first.

Without an `ANTHROPIC_API_KEY`, the app still works — static analysis runs
normally and the AI panel shows a clear "not configured" notice instead of
failing the whole request.

## API

| Method | Route             | Description                                   |
|--------|-------------------|------------------------------------------------|
| POST   | `/api/review`     | Body: `{ code }` JSON, or multipart `file`     |
| GET    | `/api/history`    | Last 50 reviews, newest first                  |
| GET    | `/api/review/:id` | A single past review                           |
| GET    | `/api/health`     | Server status + whether AI is configured       |

## Where to take this next

- Swap `services/db.js` for a real database (Postgres/MongoDB) — every other
  module only talks to the functions it exports, so nothing else needs to change.
- Add real accounts (JWT or session-based auth) so history is scoped per user.
- Replace the hand-written static analyzer with real ESLint/Pylint processes
  run in a sandboxed subprocess per language.

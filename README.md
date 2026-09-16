# VIBE CHECK

An interactive, brutalist-styled guide + gauntlet on shipping real code with AI agents. Built for the CampAI S2E15 challenge ("Agentic Coding Guide").

Three modes:

- **The Guide** — a 6-step walkthrough of the real agentic workflow (Plan → Prompt → Diff → Test → Commit → Ship) and the mistake at each step that sinks a vibe-coded build.
- **The Gauntlet** — 20 timed rounds of realistic scenarios (a plan, a diff, a claimed test result). Call SHIP or REVERT before the clock runs out.
- **Live Lab** — talks to a real AI agent. You write an actual prompt, it's sent to an LLM via OpenRouter that's constrained to return one named function, and the response runs against real test cases inside a sandboxed iframe with pass/fail visualization.

## Running locally

```
npm install
npm start
```

Serves on `http://localhost:3000` (or `$PORT`).

## Live Lab / OpenRouter setup

Live Lab needs a server-side OpenRouter key. Without one, the Guide and Gauntlet still work fully — Live Lab just shows an "offline" message.

Set these as environment variables (Railway: `railway variable set KEY --stdin --service vibe-check`, piping the value in so it never lands in shell history):

- `OPENROUTER_API_KEY` (required) — from https://openrouter.ai/keys
- `OPENROUTER_MODEL` (optional) — defaults to `openai/gpt-4o-mini`
- `SITE_URL` (optional) — defaults to the deployed Railway domain; used for OpenRouter's attribution headers

The `/api/agent` endpoint rate-limits to 8 requests per IP per 5 minutes (in-memory, single instance) to keep a live audience from running up the bill.

## Live Lab safety

Every agent response is scanned for `fetch`/`XMLHttpRequest`/globals/`eval`/infinite-loop patterns before it's ever executed — a flagged response is blocked, not run. Everything that does run happens inside a sandboxed (`sandbox="allow-scripts"`, no `allow-same-origin`) iframe with a 3s timeout, isolated from the page.

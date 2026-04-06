# FRONTEND_POLISH_AND_AI_DASHBOARD_REPORT

## 1. Components Added / Updated

### New files

| File | Purpose |
|---|---|
| `frontend/src/components/AiDashboard.tsx` | Full recruiter AI workflow panel — replaces the simple AiPanel |
| `frontend/src/hooks/useAiTaskWs.ts` | WebSocket hook that connects to `/ai/ws/{taskId}` and streams live task updates |

### Modified files

| File | Change |
|---|---|
| `frontend/src/App.tsx` | Replaced `AiPanel` with `<AiDashboard />`, removed now-redundant `AiPanel` function, imported `AiDashboard` |
| `frontend/src/App.css` | Major design system upgrade (see §2), plus ~350 lines of AI-dashboard-specific CSS |
| `frontend/vite.config.ts` | Added `/ai/ws` proxy entry with `ws: true` so the WebSocket connects through the Vite dev server |

---

## 2. Styling / Design Improvements

### Design tokens (`App.css` `:root`)
- Added `--surface-raised`, `--accent-light` for subtle hierarchy
- Added `--shadow-md` and `--shadow-lg` (multi-layer shadows for depth)
- Added `--glass-bg` and `--glass-border` (semi-transparent white for glass surfaces)
- Added `--radius-lg` for larger rounded corners on panels
- Added `--success` color token

### Navigation / topbar
- **Glassmorphism**: `backdrop-filter: blur(12px)` + semi-transparent background
- **Sticky positioning**: stays visible while scrolling
- Nav buttons now have a subtle box-shadow on `.active` state and smooth `transition`

### Background
- App background now has subtle radial gradient spots at top-left and bottom-right for depth (no visible pattern, just a warmth)

### Buttons
- Primary button uses a gradient and `box-shadow` with lift-on-hover (`transform: translateY(-1px)`)
- Button transitions added to ghost and auth buttons

### Cards
- Cards lift on hover (`box-shadow` transition + 1 px `translateY`)
- Chart cards have the same lift behavior

### Typography
- `h2 / .panel-heading` slightly larger (1.4 rem), tighter letter-spacing (`-0.025em`), weight 700
- `font-weight: 700` on brand heading with tighter tracking

### Content area
- `max-width` widened from 960 px → 1200 px to comfortably accommodate the two-column AI layout

---

## 3. AI Dashboard Flow

The `AiDashboard` component replaces the previous single-purpose resume-parsing panel with a full recruiter workflow. It has two top-level tool tabs:

### "Hiring workflow" tab

**Sidebar (left, 260 px):**
- New analysis card: Job ID + Top N inputs → "Start analysis" button → calls `POST /ai/analyze-candidates` → immediately adds the new task to the list and connects the WebSocket
- Task list: all active tasks from `POST /ai/tasks/list`, each showing job ID + animated status pill (e.g. "Running…" pulses blue)
- Selecting a task opens its live detail in the right pane

**Detail pane (right):**

| State | UI |
|---|---|
| No task selected | Empty state with robot emoji + prompt |
| Task queued/running | Progress bar (0–100 %) + animated status pill + step timeline |
| Task `awaiting_approval` | Shortlist candidate cards + collapsible outreach drafts + approval box |
| Task approved/rejected/failed | Terminal status badge + full results still visible |

**Shortlist cards:** Avatar initial, candidate name, recommendation badge (Strong/Good/Weak, color-coded), overall score percentage, animated score bar (green/amber/red), and sub-scores (Skills / Location / Seniority) as small pills.

**Outreach drafts:** Collapsible cards — click to expand and read the full generated email body.

**Approval box:** Shown only when status is `awaiting_approval`. Includes an optional feedback textarea, a green "Approve" button (calls `POST /ai/approve` with `approved: true`), and an outlined red "Reject" button (`approved: false`). The task list refreshes after a decision.

### "Resume parser" tab

Preserved resume-parsing tool (same as the old `AiPanel`), just moved to a sub-tab. Parses via `POST /ai/parse-resume` and renders the JSON output.

---

## 4. WebSocket Integration

### Hook: `useAiTaskWs(taskId: string | null)`

Returns `{ taskState: WsTaskState | null, wsStatus }`.

**Connection lifecycle:**
1. When `taskId` changes to a non-null value the hook creates a new `WebSocket` to `ws://{vite-host}/ai/ws/{taskId}`
2. On open: sets `wsStatus = 'open'`, starts a 25 s `setInterval` that sends `"ping"` keepalives
3. On message: parses JSON, merges the incoming delta into `taskState` via a functional `setState` (preserves accumulated `steps` array)
4. On unexpected close: retries up to 5 times with a 2 s delay (`wsStatus` cycles back through `'connecting'`). After 5 failed retries sets `wsStatus = 'closed'`
5. When `taskId` is cleared (task deselected): immediately closes the socket and resets state

**Vite proxy** (`vite.config.ts`):
```ts
'/ai/ws': {
  target: 'http://127.0.0.1:8000',
  changeOrigin: true,
  ws: true,
}
```
This makes WebSocket connections from the browser to `ws://localhost:5173/ai/ws/{id}` get tunnelled to `ws://127.0.0.1:8000/ai/ws/{id}` — no hardcoded backend URL in the frontend code.

**Visual indicator:** A small colour-coded dot (`.ws-dot`) in the task detail header shows live WebSocket state:
- Grey — idle
- Amber pulsing — connecting
- Green glowing — open
- Red — error

---

## 5. Limitations

1. **WebSocket in production / without Vite dev server**: The Vite `ws: true` proxy only works in the dev server. In a production build, set `VITE_API_URL` to the backend origin and update the hook to construct `ws://` from that variable (currently falls back to `window.location.host` which works with the Vite proxy).

2. **No task persistence across page refresh**: `POST /ai/tasks/list` loads tasks that are still in the in-memory `active_tasks` dict on the backend. Terminal tasks (approved, rejected, failed) are stored in MongoDB but not returned by the list endpoint. Refreshing the page re-fetches the live dict only. Deep task history requires a dedicated MongoDB query endpoint.

3. **WS snapshot vs. delta**: The backend sends a full status snapshot on connect, then step-delta messages on each update. The hook merges them, but if the browser connects after `complete` the steps array in the snapshot is authoritative; later deltas only contain `{task_id, status, current_step, progress, updated_at, step_data}` without a full `steps` field. The hook handles this gracefully by keeping the existing `steps` when the incoming message omits them.

4. **No token auth on WebSocket**: The `/ai/ws/{task_id}` endpoint does not require a JWT. The frontend does not send one. If you add auth to that endpoint in future, the hook would need to pass the token as a query parameter.

5. **Candidate names**: The backend's shortlist entries contain `candidate_id` (member_id integer). The `candidate_name` field is populated only if the outreach generator enriches it. If absent, the UI falls back to "Candidate #ID".

---

## 6. Demo Instructions

### Prerequisites
```bash
# Terminal 1 — Docker infra
cd /Users/spartan/Documents/data236/Linkedin
docker compose up -d

# Terminal 2 — Backend
cd backend
uvicorn main:app --reload

# Terminal 3 — Frontend
cd frontend
npm run dev
```

Open `http://localhost:5173`.

### AI dashboard walkthrough

1. **Navigate to the "AI tools" tab** in the nav bar.
2. **Enter a Job ID** that exists in the database (e.g. `1`) and a Top N value (e.g. `5`).
3. Click **Start analysis** — the task appears in the sidebar with a "Queued" pill.
4. Within a few seconds the pill changes to "Running…" (blue pulse) and the WebSocket dot turns green.
5. **Watch the progress bar** advance as each step completes:
   - Fetch data (10 % → 20 %)
   - Parse resumes (30 % → 50 %)
   - Match candidates (60 % → 75 %)
   - Generate outreach (85 % → 90 %)
   - Complete (100 %)
6. Status transitions to **"Awaiting approval"** (amber). The step timeline, candidate shortlist, and outreach drafts appear.
7. Expand an outreach draft by clicking it to read the generated email.
8. Optionally type feedback, then click **Approve** or **Reject**.
9. Status updates to Approved/Rejected in the sidebar.

### Resume parser
Switch to the "Resume parser" sub-tab, paste or edit resume text, click "Parse resume".

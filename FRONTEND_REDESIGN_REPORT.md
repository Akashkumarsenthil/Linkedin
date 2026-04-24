# Frontend Redesign Report

## Summary

The frontend has been redesigned from a developer-console look to a LinkedIn-inspired professional UI. All existing functionality is preserved; only layout, styling, and two components' identity handling were updated.

---

## Design Choices

### Color Palette
| Token | Value | Used for |
|-------|-------|----------|
| `--accent` | `#0a66c2` | Primary blue — buttons, active states, links |
| `--bg` | `#f3f2ef` | Warm gray page background (LinkedIn exact) |
| `--surface` | `#ffffff` | Card backgrounds |
| `--surface2` | `#f9fafb` | Secondary surfaces (code blocks, sub-cards) |
| `--border` | `rgba(0,0,0,.12)` | Subtle card borders |
| `--success` | `#057642` | Accepted, approved states |
| `--error` | `#b24020` | Errors, rejected states |
| `--warn` | `#b45309` | Pending, awaiting-approval states |

### Typography
System font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial`  
Base size: `14px`, line-height `1.5`.

### Card System
White cards with `border: 1px solid rgba(0,0,0,.12)` and `border-radius: 8px` — identical to LinkedIn's card style. Cards are used for jobs, members, AI tasks, analytics, forms.

### Buttons
- **Primary**: `#0a66c2` background, pill-rounded (`border-radius: 50px`) — LinkedIn style
- **Secondary**: transparent with blue border
- **Ghost**: neutral border, light hover
- **Danger**: red outline

### Layout
- Top nav: `52px` sticky header (LinkedIn's exact height)
- Nav tabs: icon (emoji) + label stacked vertically, LinkedIn desktop-style
- Content: `max-width: 1200px`, centered, `padding: 24px 16px`
- AI dashboard: 2-column (260px sidebar + 1fr detail)
- Messaging: 2-column (280px thread list + 1fr chat)
- Members/Jobs: responsive grid

---

## Pages / Components Changed

### Global
| File | Change |
|------|--------|
| `src/App.css` | Complete rewrite — LinkedIn palette, card system, all component styles |
| `src/App.tsx` | Redesigned nav with icon+label, search bar, user avatar, role badge |

### Components
| File | Change |
|------|--------|
| `components/AuthPanel.tsx` | New card-based layout; tabs renamed "Sign in / Join as Member / Join as Recruiter"; restores state on page load |
| `components/MessagingPanel.tsx` | **Replaced manual identity bar with `parseStoredUser()`** — uses JWT token; shows login prompt for guests; LinkedIn-style chat bubbles |
| `components/ConnectionsPanel.tsx` | **Replaced manual identity bar with `parseStoredUser()`** — auto-loads connections on mount; shows appropriate prompts for guests/recruiters; avatars on connection list |

### Unchanged (inherit new CSS)
`JobDetailPanel`, `JobApplyForm`, `MemberCreateForm`, `AiDashboard`, chart components — all benefit from the new CSS without component changes.

---

## Role-Specific Views

### Guest (no token)
- Nav: Home · Jobs · Network · Account
- Jobs page: read-only browse and detail view
- Members page: read-only browse
- Account page: sign-in / register forms
- Messaging/Connections: shows "sign in" prompt card

### Member (token, user_type = "member")
- Nav: Home · Jobs · Network · Messaging · Connections · Account
- Jobs: can apply (member ID auto-filled from token) and save
- Members: can browse (create-member form still visible for demo)
- Messaging: full 2-column chat, threads auto-loaded from token identity
- Connections: full network management, auto-loaded on mount
- AI Recruiter tab: hidden

### Recruiter (token, user_type = "recruiter")
- Nav: Home · Jobs · Analytics · Messaging · AI Recruiter · Account
- Jobs: can create, update, close (ownership enforced by backend)
- Analytics: full recruiter + platform charts
- Messaging: full chat (can message members)
- AI Recruiter: full hiring workflow
- Members/Connections tabs: hidden

---

## WebSocket Integration (AI Recruiter)

The `useAiTaskWs` hook connects to `/ai/ws/{task_id}` via native `WebSocket`:

1. **Connection lifecycle**: `idle → connecting → open → closed/error`
2. **Ping/pong**: sends `"ping"` every 25 s to keep the connection alive
3. **Auto-retry**: up to 5 reconnection attempts with 2 s delay
4. **Message merging**: each WS frame merges into task state (steps array accumulated)
5. **Task badges**: styled with new CSS status pill classes:
   - `queued` → gray
   - `running` → blue
   - `awaiting_approval` → orange
   - `approved` / `completed` → green
   - `rejected` / `failed` / `interrupted` → red
6. **WS status dot**: small colored dot in the detail header — green=open, orange=connecting, red=error
7. **Progress bar**: smooth animated fill tracking `taskState.progress` (0–100)
8. **Step timeline**: each pipeline step shown with colored dot (running=blue, completed=green, failed=red)

---

## Files Changed

| File | Type |
|------|------|
| `frontend/src/App.css` | Full rewrite |
| `frontend/src/App.tsx` | Nav + layout update |
| `frontend/src/components/AuthPanel.tsx` | UI redesign |
| `frontend/src/components/MessagingPanel.tsx` | Auth integration + UI |
| `frontend/src/components/ConnectionsPanel.tsx` | Auth integration + UI |
| `FRONTEND_REDESIGN_REPORT.md` | New file (this document) |

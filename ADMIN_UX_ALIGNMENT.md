# Admin UX Alignment

## 1. The Problem

Before this change, admins landed on the HomeFeed (`overview`) — a social page with a post composer, LinkedIn News, and a memory game. The only purpose-built admin page (`perf` / Performance Dashboard) was buried behind a full social nav. Admins saw 9+ irrelevant tabs: Home, Messaging, Connections, Career Coach, Saved Jobs, News, Events, and Notifications.

## 2. What Changed

All changes are in `frontend/src/App.tsx`. No new files, no backend changes, no component changes.

| Location | Change |
|---|---|
| `TAB_VISIBILITY` | Removed `'admin'` from: `overview`, `career`, `messages`, `connections`, `notifications`, `post`, `events`, `saved`, `news` |
| `ALL_NAV` | Renamed `'Performance'` → `'Dashboard'` (already admin-only tab — zero impact on other roles) |
| `useState<Tab>` init | Admin users load directly into `'perf'` on page load |
| `handleAuthChange` | After login, admin lands on `'perf'`; members/recruiters land on `'overview'` |
| Tab fallback `useEffect` | If admin navigates to a hidden tab, fallback is `'perf'` not `'overview'` |
| Notifications bell | Hidden for admin (`role !== 'admin'` guard) |
| Brand logo click | Admin clicks logo → `'perf'`; others → `'overview'` |

## 3. What Is Admin-Only

Every change above is gated on `role === 'admin'` or equivalent. Members and recruiters see no difference in behavior, nav, labels, or routing.

## 4. What Was Intentionally Left Unchanged

- Member landing: `overview` (HomeFeed)
- Recruiter landing: `overview` (HomeFeed)
- Member nav: unchanged
- Recruiter nav: unchanged
- All components: untouched
- All backend routes: untouched
- Admin can still access: `jobs`, `members`, `analytics`, `ai`, `perf` (Dashboard), `search`, `profile`, `settings`

## 5. Final Admin Tab Structure

| Tab | Nav Label | Notes |
|---|---|---|
| `perf` | Dashboard | Admin landing page; Kafka health, service status, benchmarks |
| `jobs` | Jobs | View all posted jobs |
| `members` | My Network | User directory |
| `analytics` | Analytics | Platform KPIs, funnel, geo trends |
| `ai` | AI Recruiter | AI hiring agent |
| `search` | (search bar) | Available via top search |
| `profile` | Me (avatar menu) | Admin's own profile |
| `settings` | Settings (avatar menu) | Account settings / sign out |

Hidden from admin: Home, Messaging, Connections, Career Coach, Notifications bell, Saved Jobs, Events, News.

## 6. Validation Summary

- TypeScript build: `npx tsc --noEmit` — no errors
- Role isolation: all changes check `role === 'admin'` or use `TAB_VISIBILITY` which is already role-keyed
- Member regression: members cannot see `perf` (unchanged; `TAB_VISIBILITY['perf'] = ['admin']`)
- Recruiter regression: recruiters cannot see `perf` (unchanged)
- Admin cannot accidentally land on hidden social tabs: fallback `useEffect` redirects to `perf`
- Guest behavior: unchanged (no admin logic applies to unauthenticated users)

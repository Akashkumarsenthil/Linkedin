# Job Detail UI Report

**Date:** 2026-04-06

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/components/JobDetailPanel.tsx` | **New** — job detail panel component |
| `frontend/src/App.tsx` | Import added; `JobsPanel` updated with View buttons, `detailJobId` state, and `<JobDetailPanel>` |
| `frontend/src/App.css` | New rules: `.card-actions`, `.job-detail-panel`, `.job-detail-*`, `.job-status-*`, `.skills-pill-row`, `.job-desc-text` |

---

## Endpoint Used

```
POST /jobs/get
Content-Type: application/json

{ "job_id": 7 }
```

The endpoint also publishes a `job.viewed` Kafka event on each cache-miss fetch,
incrementing `views_count` via the consumer. The detail panel fires this event
naturally each time a job is viewed for the first time within the 300-second
Redis TTL window.

---

## Fields Displayed

| Field | Source key | Notes |
|-------|-----------|-------|
| Title | `title` | Panel heading |
| Status | `status` | Green badge (`open`) or red badge (`closed`) |
| Seniority | `seniority_level` | Pill, omitted when null |
| Employment type | `employment_type` | Pill, omitted when null |
| Work mode | `work_mode` | Pill |
| Location | `location` | With 📍 prefix |
| Views | `views_count` | Stat row |
| Applicants | `applicants_count` | Stat row |
| Posted date | `posted_datetime` | Date portion only (YYYY-MM-DD) |
| Job ID | `job_id` | Stat row |
| Salary | `salary_min` / `salary_max` | Formatted as `$150,000 – $220,000 / year`; omitted when both null |
| Required skills | `skills_required` | Rendered as pills; section omitted when empty |
| Description | `description` | Full text, `pre-wrap` whitespace; section omitted when null |

---

## Flow

### Opening a detail view

1. Run a job search — cards appear with **View** and **Apply** buttons.
2. Click **View** on any card:
   - The button changes to **Viewing ▴**
   - `JobDetailPanel` appears below the card list and fetches `/jobs/get`
   - Loading state shown while the request is in flight
   - Full job detail renders on success
3. Click **View ▴** again (or **✕ Close**) to dismiss the panel.

Only one job detail is open at a time — clicking **View** on a different card
replaces the current panel.

### View + Apply together

**View** and **Apply** are independent. A user can open a job detail and
simultaneously have it pre-filled in the apply form (by clicking **Apply**
on the same or a different card).

### Error state

If `/jobs/get` returns `success: false` or the request fails (network error,
job not found), an inline red error message is shown inside the panel instead
of the detail fields.

---

## Limitations

### No live update of view/applicant counts
`views_count` and `applicants_count` shown in the panel reflect the value at
fetch time. Viewing or applying does increment these in MySQL (via the Kafka
consumer), but the panel does not re-fetch automatically.

### Single panel at a time
Only one job detail panel is open at a time. The previous panel is replaced
when a new **View** is clicked. There is no side-by-side comparison.

### Search only shows open jobs
`POST /jobs/search` filters `status = "open"` server-side, so closed jobs
never appear in search results. Closed jobs can still be fetched by typing
their ID directly into the **Job ID** field in the apply form.

### Description is plain text
`description` is stored as a `Text` column and rendered with `white-space: pre-wrap`.
Any HTML or Markdown in the description is shown as raw characters, not rendered.

---

## Demo Instructions

1. Start the stack:
   ```bash
   docker compose up -d
   docker compose exec backend python seed_data.py --quick --yes
   ```

2. Open `http://localhost:5173` and go to the **Jobs** tab.

3. Click **Search** (default keyword "engineer").

4. Click **View** on any result card.
   - The detail panel appears below the list showing title, status badge,
     location, work mode, salary, skills, and description.

5. Click **View ▴** again to collapse the panel.

6. Click **View** on a different card — the panel updates to the new job.

7. To see the **closed** badge: close a job via Swagger UI
   (`POST /jobs/close`, `{ "job_id": N }`), then fetch it by job ID using
   the **Apply** form's Job ID field (type the ID and look at the panel).

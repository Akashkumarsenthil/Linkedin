# Apply to Job — UI Report

**Date:** 2026-04-06

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/components/JobApplyForm.tsx` | **New** — apply form component |
| `frontend/src/App.tsx` | Import added; `JobsPanel` updated with Apply buttons + `<JobApplyForm>` |
| `frontend/src/App.css` | New rules for Apply button, selected-card highlight, error cards |

---

## Endpoint Used

```
POST /applications/submit
Content-Type: application/json
```

Request body:

```json
{
  "member_id": 1,
  "job_id": 7,
  "cover_letter": "Why I'm a great fit…"
}
```

`cover_letter` is omitted when the textarea is left blank.
`resume_text` is not sent from the form — the backend falls back to the member's
stored `resume_text` from their profile automatically (`applications.py:63`).

Backend error responses use HTTP 200 with `{ "success": false, "message": "..." }`
(not HTTP 4xx) — the form reads the `success` field to distinguish outcomes.

---

## Flow Added

### 1 — Search for a job (existing)

The keyword search works as before. Each result card now shows its **ID** badge
and an **Apply** button.

### 2 — Select a job from results

Clicking **Apply** on a card:
- Highlights the card with a blue border
- Pre-fills the Job ID field in the form below
- Changes the button label to **Selected ✓**

Clicking the same card again deselects it and clears the pre-fill.

### 3 — Fill in the form

The form (below the search results) has three fields:

| Field | Required | Notes |
|-------|----------|-------|
| Member ID | Yes | Number input; enter from the Members tab |
| Job ID | Yes | Pre-filled from card click, or type directly |
| Cover letter | No | Textarea; omitted from request if blank |

### 4 — Submit

Clicking **Submit application** disables the button and shows "Submitting…".

On completion the form shows one of four outcomes:

| Outcome | Display |
|---------|---------|
| **Success** | Green banner: "✓ Application submitted — ID #N · Member M → Job J · status: submitted" |
| **Duplicate** | Amber card: "Already applied" + backend message |
| **Closed job** | Red card: "Job is closed — This posting is no longer accepting applications" |
| **Other error** (member not found, job not found) | Red text with backend `message` |
| **Network/HTTP error** | Red text with thrown error message |

On success the Job ID field and cover letter are cleared; the card selection is reset.

---

## Limitations

### No member picker
There is no dropdown of members. The user must type a member ID. Valid IDs are
visible in the Members tab → search results. Seeded data uses IDs 1–60 (quick
seed) or 1–10,000 (full seed).

### No resume upload
The form does not expose `resume_text` or `resume_url`. The backend uses the
member's stored profile resume when `resume_text` is omitted from the request —
this is sufficient for a demo.

### No search-results refresh after apply
The job card does not update its applicant count after a successful submission.
The backend increments `applicants_count` in MySQL; a fresh search will reflect
the new count.

### Job status not shown in cards
The search result cards do not display whether a job is `open` or `closed`.
A closed-job error will only surface after attempting to submit.

---

## Demo Instructions

1. Start the stack and seed data:
   ```bash
   docker compose up -d
   docker compose exec backend python seed_data.py --quick --yes
   ```

2. Open the frontend at `http://localhost:5173`.

3. Go to the **Jobs** tab.

4. Click **Search** (default keyword "engineer").

5. Click **Apply** on any job card — the card highlights and Job ID pre-fills.

6. Scroll down to the **Apply to a job** form.

7. Enter a member ID (e.g. `1`) and optionally a cover letter.

8. Click **Submit application**.
   - **Success:** green banner with application ID.
   - **Try the same job + member again** → amber "Already applied" card.
   - **Apply to job ID 999** → red "Job 999 not found" error.

9. To test a closed-job error: use the Swagger UI at `http://localhost:8000/docs`
   to call `POST /jobs/close` on a job, then attempt to apply to it.

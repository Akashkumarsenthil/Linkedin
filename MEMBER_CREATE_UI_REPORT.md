# Member Create UI Report

**Date:** 2026-04-06

---

## What Was Added

A "Create member" form has been added to the **Members** tab of the frontend
demo console. It sits directly below the existing member search results, separated
by a divider line. The form submits to the existing `POST /members/create` backend
endpoint and shows loading, success, and error states inline.

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/components/MemberCreateForm.tsx` | **New** — self-contained form component |
| `frontend/src/App.tsx` | Import added; `<MemberCreateForm />` rendered at the bottom of `MembersPanel` |
| `frontend/src/App.css` | 6 new CSS rules for the form layout (`.create-form-section`, `.form-grid`, `.create-success`, etc.) |

---

## Endpoint Used

```
POST /members/create
Content-Type: application/json
```

Request body sent by the form:

```json
{
  "first_name": "Jane",
  "last_name": "Smith",
  "email": "jane@example.com",
  "headline": "ML Engineer at Acme",
  "location_city": "San Jose",
  "location_state": "California",
  "skills": ["Python", "Kafka", "React"]
}
```

Optional fields are omitted from the request body when left blank.
`skills` is entered as a comma-separated string in the UI and split into a
`string[]` before submission.

---

## Fields Exposed

| UI Label | Backend field | Required | Notes |
|----------|--------------|----------|-------|
| First name | `first_name` | Yes | max 100 chars |
| Last name | `last_name` | Yes | max 100 chars |
| Email | `email` | Yes | must be unique |
| Headline | `headline` | No | max 500 chars |
| City | `location_city` | No | |
| State / Province | `location_state` | No | |
| Skills | `skills` | No | comma-separated → `string[]` |

Fields **not exposed** in the form (all optional backend fields): `phone`,
`location_country`, `about`, `experience`, `education`, `profile_photo_url`,
`resume_text`. These can be set via the Swagger UI at `/docs` or Postman.

---

## UI States

| State | Behaviour |
|-------|-----------|
| **Loading** | Button label changes to "Creating…", button disabled |
| **Success** | Form fields cleared; green banner shows "✓ Created — member ID #N" with name + email |
| **Backend error** (`success: false`) | Red error text shows `message` from the API response (e.g. "Email already exists") |
| **Network / HTTP error** | Red error text shows the thrown error message |
| **Client-side validation** | Red error shown immediately if first name, last name, or email is blank |
| **Clear button** | Appears when any required field has text; resets form and clears all state |

---

## Limitations

### No viewer identity / auth
The form sends no session or auth header. The backend `POST /members/create`
does not require authentication, so any submission is accepted.

### Omitted fields
`experience`, `education`, and `about` require more complex inputs (nested
objects, textarea). They can be added after creation via `POST /members/update`
through the Swagger UI.

### No optimistic update to search results
After creating a member the search list above the form is not automatically
refreshed. Clicking "Search" again will pick up the new member if the keyword
matches.

### `skills` is free-text comma input
There is no autocomplete or validation on skill names. The backend accepts any
strings. Malformed entries (extra commas, whitespace) are cleaned by the
`.trim().filter(Boolean)` split before submission.

---

## Demo Instructions

1. Start the stack:
   ```bash
   docker compose up -d
   docker compose exec backend python seed_data.py --quick --yes
   ```

2. Open the frontend at `http://localhost:5173` (Vite dev) or the Docker URL.

3. Click **Members** in the top nav.

4. Scroll below the search results to the **Create member** section.

5. Fill in at minimum: first name, last name, and a unique email address.

6. Optionally add headline, city/state, and skills (comma-separated).

7. Click **Create member**.
   - On success: green banner with the new member ID.
   - On duplicate email: red error "Email '…' already exists".

8. The new member is immediately searchable — type a name or skill keyword in
   the search box above and click **Search**.

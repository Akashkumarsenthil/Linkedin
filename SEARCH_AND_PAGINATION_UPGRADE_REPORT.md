# SEARCH_AND_PAGINATION_UPGRADE_REPORT

## 1. Search Endpoints Upgraded

| Endpoint | Before | After |
|---|---|---|
| `POST /jobs/search` | LIKE on title+description, offset pagination | FULLTEXT MATCH…AGAINST, keyset cursor, salary filters, sort options |
| `POST /members/search` | LIKE on name/headline/about, offset pagination, no ordering | FULLTEXT MATCH…AGAINST, keyset cursor, sort options |

All other endpoints (`/applications/byJob`, `/applications/byMember`, `/threads/byUser`, `/messages/list`, `/connections/list`) were **not changed** — they are feed-style lists for known IDs, not open search, and offset pagination is appropriate there.

---

## 2. Cursor Design

### Concept

A **cursor** is an opaque, base64-encoded JSON token that encodes the position of the last result seen. The frontend passes it back in the next request instead of a page number.

```
Request 1: { keyword: "engineer", page_size: 15 }
Response 1: { data: [...15 jobs...], next_cursor: "eyJ0eXBlI...", has_more: true }

Request 2: { keyword: "engineer", page_size: 15, cursor: "eyJ0eXBlI..." }
Response 2: { data: [...next 15 jobs...], next_cursor: "eyJ0eXBlI...", has_more: false }
```

### Two cursor types (transparent to the caller)

| Type | When used | What it encodes | SQL mechanism |
|---|---|---|---|
| `keyset` | date sort, no keyword | `{ type: "keyset", dt: "2024-01-15T10:30:00", id: 142 }` | `WHERE (posted_datetime, job_id) < (cursor_dt, cursor_id)` |
| `offset` | relevance sort, `applicants`, `views` | `{ type: "offset", offset: 30 }` | `OFFSET cursor_offset LIMIT page_size` |

The caller always gets the same response shape regardless of which type is in use internally. The type is embedded in the cursor token itself so the server always knows how to decode it.

### Why two types?

**True keyset pagination** is only stable when the sort key is a stored column value that can appear in a `WHERE` clause. For `posted_datetime DESC, job_id DESC` this works perfectly.

When sorted by **relevance** (MySQL `MATCH()` score), the score is computed at query time and is not stored — it cannot be used in a `WHERE` clause on the next request without re-running the full-text match twice per page, making the keyset condition awkward. Offset-encoded cursor is used in that case; it still degrades gracefully (same problem as offset pagination at scale) but keeps the API surface identical.

### Cursor encoding

```python
def _encode_cursor(data: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(data, default=str).encode()).decode()

def _decode_cursor(cursor: str) -> dict:
    try:
        return json.loads(base64.urlsafe_b64decode(cursor + "==").decode())
    except Exception:
        return {}
```

URL-safe base64 (no `+` or `/`) makes the cursor safe in query strings without encoding.

### Stability guarantee

When using keyset mode (`sort_by=date`, no keyword):

- **Insertions** between pages do not affect results — new jobs have newer `posted_datetime`, so they appear before the cursor position, not in it
- **Deletions** between pages do not affect results — the keyset condition skips deleted rows naturally
- **Consistent ordering** — `(posted_datetime DESC, job_id DESC)` is a total order since `job_id` is unique

---

## 3. Files Changed

### Backend

| File | Change |
|---|---|
| `backend/schemas/job.py` | Added `salary_min`, `salary_max`, `sort_by`, `cursor` to `JobSearch`; added `next_cursor`, `has_more` to `JobListResponse` |
| `backend/schemas/member.py` | Added `sort_by`, `cursor` to `MemberSearch`; added `next_cursor`, `has_more` to `MemberListResponse` |
| `backend/routers/jobs.py` | Added `_encode_cursor`/`_decode_cursor` helpers; rewrote `search_jobs` with FULLTEXT, salary filters, sort options, keyset/offset cursor pagination |
| `backend/routers/members.py` | Added `_encode_cursor`/`_decode_cursor` helpers; rewrote `search_members` with FULLTEXT, sort options, keyset/offset cursor pagination, explicit ordering |

### Frontend

| File | Change |
|---|---|
| `frontend/src/App.tsx` | `JobsPanel`: state now accumulates results across pages, added `sortBy` select, replaced `page: 1` hardcode with cursor-aware `doSearch(cursor)`, added "Load more" button; `MembersPanel`: same pattern, added sort select and location pill on cards |
| `frontend/src/App.css` | Added `.load-more-btn` style |

---

## 4. Search Quality Improvements

### FULLTEXT search (MySQL MATCH…AGAINST)

The database already had `FULLTEXT INDEX idx_job_search (title, description)` and `FULLTEXT INDEX idx_search (first_name, last_name, headline, about)` — they were unused. These are now activated.

**Before**: `WHERE title LIKE '%engineer%' OR description LIKE '%engineer%'`
- Scans the whole table (or uses LIKE index if available)
- No relevance ranking
- Word boundary mismatches (matches "engineers" and "reengineering" equally)

**After**: `WHERE MATCH(title, description) AGAINST('+engineer*' IN BOOLEAN MODE)`
- Uses the FULLTEXT index (much faster for large datasets)
- Boolean mode with prefix matching (`engineer*`) catches "engineering", "engineers"
- When keyword is present without explicit sort, results are ranked by relevance score descending, then date

**Fallback**: keywords shorter than 3 characters still use LIKE (MySQL FULLTEXT requires min 3 chars by default).

### Salary filters (jobs only)

New filter parameters on `POST /jobs/search`:

```json
{ "salary_min": 120000, "salary_max": 180000 }
```

- `salary_min`: matches jobs where `salary_max >= salary_min` (or `salary_max` is null) — "jobs that can afford me"
- `salary_max`: matches jobs where `salary_min <= salary_max` (or `salary_min` is null) — "jobs within budget"
- Both can be combined to find overlapping salary ranges

### Sort options

**Jobs** (`sort_by`):
- `date` (default) — `posted_datetime DESC, job_id DESC` — most recently posted first; enables keyset cursor
- `applicants` — `applicants_count DESC, job_id DESC` — most competitive jobs first
- `views` — `views_count DESC, job_id DESC` — trending jobs first

**Members** (`sort_by`):
- `id` (default) — `member_id ASC` — stable insertion order; enables keyset cursor
- `connections` — `connections_count DESC, member_id ASC` — most-connected members first
- `recent` — `created_at DESC, member_id DESC` — newest profiles first

### Skill matching improvement

Old:
```python
query.filter(JobPosting.skills_required.like(f'%"{skill}"%'))
```
Only matched skills that were JSON-serialized with quotes. Missed partial matches.

New:
```python
query.filter(or_(
    JobPosting.skills_required.like(f'%"{skill}"%'),   # quoted element
    JobPosting.skills_required.like(f'%{skill}%'),      # bare substring
))
```
Catches both `["Python", "FastAPI"]` and legacy data that may be stored without quotes.

### Member search now has ordering

Previously `search_members` had no `ORDER BY` at all — result order was non-deterministic (depends on MySQL's internal row storage order). The new default sort by `member_id ASC` makes results deterministic and page-stable.

---

## 5. Whether Elasticsearch Was Added or Deferred

**Elasticsearch was deferred.**

### Rationale

The existing database already has FULLTEXT indexes (`idx_job_search`, `idx_search`) that provide:
- Relevance-ranked search
- Boolean mode with prefix matching (`word*`)
- Performance on typical dataset sizes

Adding Elasticsearch would require:
- A new Docker service (≥ 512 MB RAM)
- An index synchronization pipeline (MySQL → ES, either via Debezium CDC or dual-write on every create/update/delete)
- A new search client library (`elasticsearch-py`)
- Handling index lag (writes visible in MySQL but not yet indexed in ES)

**When to add Elasticsearch:**
- Dataset exceeds ~500k jobs or ~1M members where FULLTEXT performance degrades
- Product needs fuzzy matching, typo correction, synonyms, faceted search
- Analytics on search queries (click-through, zero-result rate)

### Future path

```
1. Deploy Elasticsearch (Docker Compose service)
2. Add `elasticsearch-py` to requirements
3. Create a sync script: dump MySQL → index in ES on startup
4. Add Debezium CDC connector (Kafka → ES) or a dual-write decorator on create/update
5. Replace MATCH…AGAINST with ES query in the search endpoints
6. Add facet counts, autocomplete, spelling suggestions
```

The current schema and response format (including `next_cursor`, `has_more`) are ES-compatible — ES supports keyset-like pagination via `search_after`.

---

## 6. Limitations

### Cursor pagination

1. **No random access**: you cannot jump to "page 7" with a cursor. You must walk forward sequentially. Existing `page`/`page_size` offset parameters still work for callers that need direct page access.

2. **Backwards navigation**: the current cursor only supports "next page", not "previous page". Backwards cursor would require storing the first-item position and generating a reverse keyset condition.

3. **Cache invalidation with cursors**: the Redis cache key includes the full cursor string, so each unique cursor gets its own cache entry. Cache churn is higher for browsing users. TTL is kept at 60 seconds.

4. **Offset-encoded cursor is not truly stable**: for relevance-sorted results, the offset cursor degrades to offset pagination under the hood. If new matching rows are inserted between requests, the offset cursor may skip or repeat rows — same as offset pagination.

5. **`total` count not returned on cursor pages**: to avoid an expensive `COUNT(*)` on every paginated request, `total` is only computed on the first (non-cursor) call. Subsequent cursor pages return `total: null`. The frontend shows "Showing N of M" on the first page and "Showing N" on subsequent pages.

### Full-text search

6. **MySQL FULLTEXT min length**: MySQL's default `ft_min_word_len = 4`. Keywords shorter than 4 characters may return no results from FULLTEXT; the code falls back to LIKE for keywords < 3 chars (guarded by Python), but a 3-character keyword may still fail FULLTEXT on default MySQL configs. Set `ft_min_word_len = 3` in `my.cnf` and rebuild the FULLTEXT index to fix this.

7. **Stop words**: MySQL FULLTEXT ignores common words ("the", "a", "in", etc.) by default. Searching for "the office" returns results for "office" only.

8. **Phrase search not implemented**: `AGAINST('+engineer +python' IN BOOLEAN MODE)` requires both words anywhere in the document, not necessarily adjacent. True phrase search requires `AGAINST('"senior engineer"' IN NATURAL LANGUAGE MODE)`.

---

## 7. Demo Instructions

### Prerequisites

```bash
docker compose up -d          # MySQL, Redis, MongoDB, Kafka
cd backend && uvicorn main:app --reload
cd frontend && npm run dev
```

### Cursor pagination via Swagger UI

1. Open `http://localhost:8000/docs`
2. Call `POST /jobs/search` with `{ "page_size": 5 }` — note `next_cursor` in the response
3. Call `POST /jobs/search` again with `{ "page_size": 5, "cursor": "<value from step 2>" }` — you get the next 5 jobs without recomputing offset

### Full-text search

```json
POST /jobs/search
{ "keyword": "machine learning", "sort_by": "date", "page_size": 10 }
```
Returns jobs ranked by FULLTEXT relevance score (highest first), then by date.

### Salary filter

```json
POST /jobs/search
{ "salary_min": 150000, "salary_max": 250000, "page_size": 20 }
```
Returns only jobs whose salary range overlaps [150k, 250k].

### Combined example

```json
POST /jobs/search
{
  "keyword": "python",
  "work_mode": "remote",
  "seniority_level": "Senior",
  "salary_min": 120000,
  "sort_by": "applicants",
  "page_size": 10
}
```

### Frontend "Load more"

1. Open the frontend at `http://localhost:5173`
2. Go to the **Jobs** tab, type a keyword, click **Search**
3. If there are more than 15 results, a **Load more** button appears below the list
4. Clicking it appends the next page without clearing existing results
5. Same flow works in the **Members** tab

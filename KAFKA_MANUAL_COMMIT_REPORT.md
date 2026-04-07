# KAFKA_MANUAL_COMMIT_REPORT

## 1. What the Risk Was Before

With `enable_auto_commit=True` (the previous configuration), aiokafka commits consumer group
offsets on a timer — by default every 5 000 ms — independently of whether message processing
has actually completed.

**The race condition:**

```
t=0   message polled from Kafka
t=1   handler starts executing (DB write, MongoDB insert, …)
t=4   auto-commit fires → offset advanced in Kafka broker
t=4.5 process crashes / container restarts
t=5   handler never finishes; side-effects never applied
```

The broker now believes the message was consumed at t=4.  On restart the consumer resumes
from the committed offset, **skipping the crashed message entirely**.  The event is silently
lost — the job view count is never incremented, the profile view is never recorded, etc.

This is **at-most-once delivery**: each event is processed at most once, but can be lost.

The idempotency layer (in-memory set + MongoDB `processed_events` collection) was already in
place, but it only protects against *duplicate* processing.  It offers no protection against
the loss scenario above, because the idempotency record is written *after* the handler
succeeds — if the handler never finishes, no record is written, yet the offset is still
advanced by auto-commit.

---

## 2. What Changed

### `backend/kafka_consumer.py`

**Single constructor change:**
```python
# Before
enable_auto_commit=True,

# After
enable_auto_commit=False,   # offsets committed manually after processing
```

**New helper method `_commit(message)`:**
```python
async def _commit(self, message) -> None:
    try:
        await self.consumer.commit()
    except Exception as e:
        logger.warning(
            f"Offset commit failed for {message.topic}:{message.partition}:{message.offset} — {e}"
        )
```

Calls `consumer.commit()` with no arguments, which commits the last polled offset for every
assigned partition.  Because messages are processed sequentially in a single `async for` loop,
this always corresponds to exactly the message that was just handled.  Commit failures are
logged but not re-raised (see §6).

**`consume()` loop — three outcome branches:**

| Outcome | Commit? | Why |
|---|---|---|
| In-memory duplicate (already in `processed_keys`) | ✅ Yes | Event handled in this run; safe to advance |
| Persistent duplicate (found in MongoDB `processed_events`) | ✅ Yes | Event handled in a previous run; safe to advance |
| Handler executed successfully + idempotency record written | ✅ Yes | Full processing confirmed; advance offset |
| Handler raised an exception | ❌ No | Event not fully processed; will redeliver on restart |
| No registered handler (unknown event type) | ✅ Yes | Logged to `event_logs`; do not stall on unknown types |

---

## 3. How Commit Semantics Now Work

### Delivery guarantee: **at-least-once**

After the change, every message follows this sequence:

```
1. Message polled from Kafka partition
2. Idempotency check (in-memory)
3. Idempotency check (MongoDB)
4. Handler executed
5. Idempotency record written to MongoDB   ← persisted BEFORE commit
6. consumer.commit() called                ← offset advanced AFTER persistence
```

If the process crashes anywhere between steps 4 and 6, the idempotency record was either
not yet written (crash at step 4/5) or was written but the commit did not complete (crash
at step 5/6):

- **Crash at step 4/5**: On restart, message is redelivered → idempotency check passes
  (no record) → handler runs again → at-least-once, no loss.

- **Crash at step 5/6** (rare): On restart, message is redelivered → idempotency check
  finds the MongoDB record → event is skipped → offset committed.  The handler is NOT
  called a second time.  This is the correct behaviour: processing was actually completed
  (step 4 succeeded), so skipping is safe.

### Why idempotency record is written *before* `commit()`

The ordering `insert_one(processed_events) → commit()` is intentional.  If the commit
succeeds but the idempotency write had not happened yet, a restart would not skip the
event, causing a double-execution.  Writing the record first means that a crash after
the record write but before the commit causes an extra re-delivery, which is harmless
(idempotency check catches it).

### Why commit errors are swallowed

A commit failure means the broker still holds the uncommitted offset.  On the next
consumer start the same message will be redelivered.  The idempotency layer handles this
correctly — the MongoDB record was already written, so the event is skipped without
calling the handler again.  Propagating the commit error would crash the consume loop;
logging a warning is the safer choice.

---

## 4. Files Changed

| File | Change |
|---|---|
| `backend/kafka_consumer.py` | `enable_auto_commit=False`; new `_commit()` helper; consume loop now calls `_commit()` after success or duplicate-skip; does NOT call `_commit()` after handler failure; updated docstring with delivery-semantics explanation |
| `backend/tests/test_reliability.py` | Extracted `_MockMessage`, `_MockAsyncIterator`, `_make_mock_consumer` as shared helpers; updated `test_kafka_consumer_idempotency` to use new helpers and assert 2 commits; added 3 new tests (see §5) |

---

## 5. Tests Added / Updated

All tests are in `backend/tests/test_reliability.py` and are marked `@pytest.mark.integration`.
They use an async mock iterator — no real Kafka broker required.

### Updated test

**`test_kafka_consumer_idempotency`** (existing, updated)
- Now uses the shared `_make_mock_consumer()` helper which includes an async `commit()` method
- Added assertion: both the original message and the duplicate-skip must each produce exactly
  one commit call (total 2 commits for 2 messages)

### New tests

**`test_kafka_consumer_commits_after_successful_processing`**
- Delivers one event with a registered handler that succeeds
- Asserts `handler_calls["count"] == 1`
- Asserts `len(commit_calls) == 1` (offset committed exactly once)

**`test_kafka_consumer_does_not_commit_after_handler_failure`**
- Delivers one event whose handler always raises `RuntimeError`
- Asserts `len(commit_calls) == 0` — offset must NOT be advanced
- Asserts no idempotency record was written to MongoDB

**`test_kafka_consumer_commits_unhandled_event_type`**
- Delivers an event with type `"unknown.future.event"` (no handler registered)
- Asserts `len(commit_calls) == 1` — offset must still advance so unknown types don't block

### Running the tests

```bash
cd backend
# Unit-style (no Docker required — tests mock the Kafka consumer):
pytest tests/test_reliability.py -m integration -v \
  -k "idempotency or commit"

# Full integration suite (needs docker compose up -d):
pytest tests/test_reliability.py -m integration -v
```

---

## 6. Limitations

1. **Per-message commit overhead**: Each successfully processed message now issues one
   `consumer.commit()` network round-trip to the Kafka broker.  For high-throughput topics
   this adds latency.  The current platform is event-driven at low volume (job views,
   connections, messages) so this is not a concern.  If throughput ever becomes a bottleneck,
   batch commit (commit every N messages) can be added while preserving the same safety
   guarantees.

2. **Commit failure is non-fatal**: If `consumer.commit()` fails (broker unavailable,
   session expired), the error is logged and the loop continues.  On restart the consumer
   will re-read from the last *successfully* committed offset, so some messages will be
   re-delivered.  The idempotency layer handles them correctly.  In extreme cases (many
   consecutive commit failures) the offset lag may grow, but no events are lost or
   double-applied.

3. **Single failed event does not block the queue**: When a handler fails, the offset is
   not committed.  On restart the same message is redelivered.  If the same message fails
   repeatedly (e.g. due to a persistent data issue), the consumer will loop on that message
   indefinitely.  There is no dead-letter queue (DLQ) or maximum retry count implemented.
   Adding a per-`idempotency_key` retry counter in MongoDB and routing to a DLQ after N
   failures is the recommended next step for production hardening.

4. **No partition-level granularity**: `consumer.commit()` with no arguments commits all
   assigned partitions to their last polled offsets.  For a single-partition-per-message
   sequential loop this is equivalent to per-message commit.  If the consumer ever moves
   to concurrent per-partition processing, explicit `TopicPartition → OffsetAndMetadata`
   commit dicts should be used.

5. **Session timeout during slow handlers**: If a handler takes longer than
   `session_timeout_ms` (10 000 ms) the broker removes the consumer from the group and
   triggers a rebalance.  The offset for the in-progress message is not committed, so it
   will be redelivered.  The current handlers (SQL write + MongoDB insert) are fast, but
   this is worth keeping in mind for any future AI-workflow handlers that call Ollama.

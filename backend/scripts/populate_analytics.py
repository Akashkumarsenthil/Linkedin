from pymongo import MongoClient
import random
from datetime import datetime, timedelta, timezone
from database import engine
from sqlalchemy import text
import uuid
from config import settings

print("Starting population script...")
mongo_client = MongoClient(settings.MONGO_URL)
db = mongo_client[settings.MONGO_DATABASE]
event_logs = db["event_logs"]

print("Connected to Mongo.")
# Get MySQL Jobs
conn = engine.connect()
res = conn.execute(text("SELECT job_id FROM job_postings LIMIT 500"))
jobs = [row[0] for row in res]
res2 = conn.execute(text("SELECT member_id FROM members LIMIT 500"))
members = [row[0] for row in res2]

print(f"Loaded {len(jobs)} jobs and {len(members)} members from MySQL.")
events = []
now = datetime.now(timezone.utc)

print("Generating 10000 fake event logs (views and saves)...")
for _ in range(10000):
    job_id = random.choice(jobs)
    member_id = random.choice(members)
    days_ago = random.randint(0, 90)
    event_time = now - timedelta(days=days_ago, hours=random.randint(0, 23), minutes=random.randint(0, 59))
    
    event_type = random.choices(["job.viewed", "job.saved"], weights=[75, 25])[0]
    
    events.append({
        "event_type": event_type,
        "trace_id": str(uuid.uuid4()),
        "timestamp": event_time.isoformat(),
        "actor_id": str(member_id),
        "entity": {
            "entity_type": "job",
            "entity_id": str(job_id)
        },
        "payload": {
            "job_id": job_id,
            "member_id": member_id,
        },
        "idempotency_key": str(uuid.uuid4())
    })

if events:
    event_logs.insert_many(events)
    print(f"Inserted {len(events)} events into MongoDB.")

print("Spreading out MySQL application dates over the last 6 months...")
conn.execute(text("""
    UPDATE applications 
    SET applied_at = DATE_SUB(NOW(), INTERVAL FLOOR(RAND() * 180) DAY)
    WHERE application_id > 0
"""))
conn.commit()
conn.close()
print("Done spreading application dates in MySQL.")

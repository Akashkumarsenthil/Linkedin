import random
from datetime import datetime, timedelta
from database import engine
from sqlalchemy import text

conn = engine.connect()

print("Populating saved_jobs...")
res = conn.execute(text("SELECT job_id FROM job_postings LIMIT 50"))
jobs = [row[0] for row in res]

res2 = conn.execute(text("SELECT member_id FROM members LIMIT 1000"))
members = [row[0] for row in res2]

inserts = []
now = datetime.now()

for j_id in jobs:
    num_saves = random.randint(200, 1000)
    for _ in range(num_saves):
        m_id = random.choice(members)
        days_ago = random.randint(0, 120)
        dt = (now - timedelta(days=days_ago)).strftime('%Y-%m-%d %H:%M:%S')
        inserts.append(f"({m_id}, {j_id}, '{dt}')")

if inserts:
    chunk_size = 2000
    for i in range(0, len(inserts), chunk_size):
        chunk = inserts[i:i+chunk_size]
        query = "INSERT IGNORE INTO saved_jobs (member_id, job_id, saved_at) VALUES " + ",".join(chunk)
        try:
            conn.execute(text(query))
        except Exception as e:
            print("Error:", e)

print("Updating views_count...")
for j_id in jobs:
    views = random.randint(5000, 20000)
    conn.execute(text(f"UPDATE job_postings SET views_count = {views} WHERE job_id = {j_id}"))

conn.commit()
print("Populated saved_jobs and views_count!")
conn.close()

import random
from datetime import datetime, timedelta
from database import engine
from sqlalchemy import text

print("Starting to insert heavy applications...")
conn = engine.connect()
res = conn.execute(text("SELECT job_id FROM job_postings LIMIT 25"))
jobs = [row[0] for row in res]

res2 = conn.execute(text("SELECT member_id FROM members LIMIT 2000"))
members = [row[0] for row in res2]

inserts = []
now = datetime.now()

for j_id in jobs:
    # create between 300 and 1500 applications per job
    num_apps = random.randint(300, 1500)
    for _ in range(num_apps):
        m_id = random.choice(members)
        days_ago = random.randint(0, 120)
        dt = (now - timedelta(days=days_ago)).strftime('%Y-%m-%d %H:%M:%S')
        inserts.append(f"({j_id}, {m_id}, 'submitted', '{dt}', '{dt}')")

if inserts:
    chunk_size = 2000
    for i in range(0, len(inserts), chunk_size):
        chunk = inserts[i:i+chunk_size]
        query = "INSERT IGNORE INTO applications (job_id, member_id, status, application_datetime, created_at) VALUES " + ",".join(chunk)
        try:
            conn.execute(text(query))
        except Exception as e:
            print("Error:", e)
    conn.commit()
    print(f"Inserted {len(inserts)} applications across {len(jobs)} jobs.")

conn.close()

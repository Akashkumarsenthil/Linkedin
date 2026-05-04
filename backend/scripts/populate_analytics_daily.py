import random
from datetime import datetime, timedelta
from config import settings
from pymongo import MongoClient
from database import engine
from sqlalchemy import text
import math

mongo = MongoClient(settings.MONGO_URL)
db = mongo[settings.MONGO_DATABASE]

coll_saves = db.analytics_saves_daily
coll_saves.delete_many({})

coll_clicks = db.analytics_job_clicks_daily
coll_clicks.delete_many({})

docs_saves = []
now = datetime.now()

conn = engine.connect()
res = conn.execute(text("SELECT job_id FROM job_postings LIMIT 50"))
jobs = [row[0] for row in res]
conn.close()

docs_clicks = []

for i in range(90):
    d = now - timedelta(days=i)
    date_str = d.strftime('%Y-%m-%d')
    year, week, _ = d.isocalendar()
    week_str = f"{year}-W{week:02d}"
    
    base = 150 + 50 * math.sin(i / 10.0)
    saves = int(base + random.randint(-20, 20))
    docs_saves.append({
        "date": date_str,
        "week": week_str,
        "saves": saves
    })
    
    for j_id in jobs:
        clicks = random.randint(10, 50)
        docs_clicks.append({
            "job_id": str(j_id),
            "date": date_str,
            "clicks": clicks
        })

coll_saves.insert_many(docs_saves)
coll_clicks.insert_many(docs_clicks)

print(f"Inserted {len(docs_saves)} days of saves and {len(docs_clicks)} job clicks.")

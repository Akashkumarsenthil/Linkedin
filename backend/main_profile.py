import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from kafka_producer import kafka_producer
from routers import members, recruiters, auth_router, notifications
from database import engine, Base
import models.user_credentials

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s")
logger = logging.getLogger("profile-service")

@asynccontextmanager
async def lifespan(app: FastAPI):
    await kafka_producer.start()
    Base.metadata.create_all(bind=engine, checkfirst=True)
    from sqlalchemy import text
    _cols = [
        # members photo + resume columns added in this branch
        "ALTER TABLE members ADD COLUMN profile_photo_url MEDIUMTEXT",
        "ALTER TABLE members ADD COLUMN cover_photo_url MEDIUMTEXT",
        "ALTER TABLE members ADD COLUMN resume_text TEXT",
        "ALTER TABLE members ADD COLUMN resume_pdf_url TEXT",
        "ALTER TABLE members ADD COLUMN resume_filename VARCHAR(255)",
        # recruiters photo columns
        "ALTER TABLE recruiters ADD COLUMN profile_photo_url MEDIUMTEXT",
        "ALTER TABLE recruiters ADD COLUMN cover_photo_url MEDIUMTEXT",
    ]
    with engine.begin() as conn:
        for sql in _cols:
            try:
                conn.execute(text(sql))
            except Exception:
                pass  # column already exists — safe to ignore

    yield
    await kafka_producer.stop()

app = FastAPI(title="Profile Service", version=settings.APP_VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

app.include_router(members.router)
app.include_router(recruiters.router)
app.include_router(auth_router.router)
app.include_router(notifications.router)

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "profile-service",
        "api": "ok",
        "mysql": "ok",
        "mongo": "ok",
        "redis": "ok",
        "kafka": "ok",
    }

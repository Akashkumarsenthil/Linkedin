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
    # Ensure photo columns are large enough for base64
    from sqlalchemy import text
    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE members MODIFY COLUMN profile_photo_url MEDIUMTEXT"))
            conn.execute(text("ALTER TABLE members MODIFY COLUMN cover_photo_url MEDIUMTEXT"))
            # Recruiters photos
            try: conn.execute(text("ALTER TABLE recruiters ADD COLUMN profile_photo_url MEDIUMTEXT"))
            except: conn.execute(text("ALTER TABLE recruiters MODIFY COLUMN profile_photo_url MEDIUMTEXT"))
            try: conn.execute(text("ALTER TABLE recruiters ADD COLUMN cover_photo_url MEDIUMTEXT"))
            except: conn.execute(text("ALTER TABLE recruiters MODIFY COLUMN cover_photo_url MEDIUMTEXT"))
        except Exception as e:
            logger.warning(f"Migration failed or partially applied: {e}")
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
    return {"status": "ok", "service": "profile-service"}

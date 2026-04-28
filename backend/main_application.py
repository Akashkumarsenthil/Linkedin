import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from kafka_producer import kafka_producer
from routers import applications
from database import engine, Base, create_mongo_indexes

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s")
logger = logging.getLogger("application-service")

@asynccontextmanager
async def lifespan(app: FastAPI):
    await kafka_producer.start()
    await create_mongo_indexes()
    Base.metadata.create_all(bind=engine, checkfirst=True)
    yield
    await kafka_producer.stop()

app = FastAPI(title="Application Service", version=settings.APP_VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

app.include_router(applications.router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "application-service"}

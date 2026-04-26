import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from kafka_producer import kafka_producer
from kafka_consumer import kafka_consumer
from routers import analytics, perf_router
from database import create_mongo_indexes

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s")
logger = logging.getLogger("analytics-service")

@asynccontextmanager
async def lifespan(app: FastAPI):
    await kafka_producer.start()
    topics = ["job.viewed", "job.saved", "job.created", "job.closed", "application.submitted", "application.statusChanged", "message.sent", "connection.requested", "connection.accepted", "profile.viewed"]
    await kafka_consumer.start(topics)
    consumer_task = asyncio.create_task(kafka_consumer.consume())
    await create_mongo_indexes()
    yield
    await kafka_producer.stop()
    await kafka_consumer.stop()
    consumer_task.cancel()

app = FastAPI(title="Analytics Service", version=settings.APP_VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

app.include_router(analytics.router)
app.include_router(perf_router.router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "analytics-service"}

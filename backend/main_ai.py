import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from kafka_producer import kafka_producer
from kafka_consumer import kafka_consumer
from routers import ai_service
from agents.hiring_assistant import rehydrate_tasks, run_dispatcher
from database import create_mongo_indexes

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s")
logger = logging.getLogger("ai-service")

@asynccontextmanager
async def lifespan(app: FastAPI):
    await kafka_producer.start()
    topics = ["ai.requests", "ai.results"]
    await kafka_consumer.start(topics)
    consumer_task = asyncio.create_task(kafka_consumer.consume())
    await create_mongo_indexes()
    await rehydrate_tasks()
    dispatcher_task = asyncio.create_task(run_dispatcher(), name="ai-dispatcher")
    yield
    await kafka_producer.stop()
    await kafka_consumer.stop()
    consumer_task.cancel()
    dispatcher_task.cancel()

app = FastAPI(title="AI Service", version=settings.APP_VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

app.include_router(ai_service.router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-service"}

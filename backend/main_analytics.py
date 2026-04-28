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
    async def _start_kafka():
        delay = 3
        while True:
            try:
                await kafka_consumer.start(topics)
                logger.info("Kafka consumer connected successfully")
                await kafka_consumer.consume()
                # consume() returned — only happens on CancelledError or explicit stop
                break
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"Kafka consumer error: {e} — restarting in {delay}s")
                try:
                    await kafka_consumer.stop()
                except Exception:
                    pass
                await asyncio.sleep(delay)
                delay = min(delay * 2, 60)

    consumer_task = asyncio.create_task(_start_kafka(), name="analytics-kafka-consumer")
    await create_mongo_indexes()
    yield
    await kafka_producer.stop()
    consumer_task.cancel()
    try:
        await kafka_consumer.stop()
    except Exception:
        pass

app = FastAPI(title="Analytics Service", version=settings.APP_VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

app.include_router(analytics.router)
app.include_router(perf_router.router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "analytics-service"}

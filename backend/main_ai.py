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

AI_KAFKA_TOPICS = [
    {"name": "ai.requests", "partitions": 1, "replication": 1},
    {"name": "ai.results",  "partitions": 1, "replication": 1},
]

async def ensure_kafka_topics() -> None:
    """
    Explicitly create ai.requests and ai.results Kafka topics on startup.

    Uses KafkaAdminClient so topics exist with the correct partition/replication
    settings regardless of whether the broker has auto-create enabled. Already-
    existing topics are silently skipped (TopicAlreadyExistsError). Failures are
    logged as warnings — the service starts anyway and relies on broker auto-create
    as a last resort.
    """
    try:
        from aiokafka.admin import AIOKafkaAdminClient, NewTopic
        admin = AIOKafkaAdminClient(bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS)
        await admin.start()
        try:
            new_topics = [
                NewTopic(name=t["name"], num_partitions=t["partitions"], replication_factor=t["replication"])
                for t in AI_KAFKA_TOPICS
            ]
            await admin.create_topics(new_topics)
            logger.info(f"Kafka topics ensured: {[t['name'] for t in AI_KAFKA_TOPICS]}")
        except Exception as e:
            # TopicAlreadyExistsError is expected on restarts — not a real error
            logger.info(f"Kafka topic check: {e}")
        finally:
            await admin.close()
    except Exception as e:
        logger.warning(f"Could not ensure Kafka topics (broker may not be ready): {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    await kafka_producer.start()
    await ensure_kafka_topics()
    await create_mongo_indexes()
    await rehydrate_tasks()

    async def _start_kafka():
        topics = ["ai.requests", "ai.results"]
        delay = 3
        while True:
            try:
                await kafka_consumer.start(topics)
                logger.info("Kafka consumer connected successfully")
                await kafka_consumer.consume()
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

    kafka_task = asyncio.create_task(_start_kafka(), name="kafka-consumer")
    dispatcher_task = asyncio.create_task(run_dispatcher(), name="ai-dispatcher")
    yield
    await kafka_producer.stop()
    kafka_task.cancel()
    dispatcher_task.cancel()
    try:
        await kafka_consumer.stop()
    except Exception:
        pass

app = FastAPI(title="AI Service", version=settings.APP_VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

app.include_router(ai_service.router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-service"}

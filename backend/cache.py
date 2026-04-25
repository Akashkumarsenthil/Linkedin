"""
LinkedIn Platform — Redis Cache Layer
Provides caching utilities for SQL query results and frequently accessed data.

Hit/miss logging
----------------
Every cache.get() call logs a DEBUG-level hit or miss.  During load tests,
grep the application logs for 'cache hit' or 'cache miss' to compute the
real hit rate:

    grep -c 'cache hit'  app.log
    grep -c 'cache miss' app.log

The raw counts are also available via cache.stats() for in-process inspection.
"""

import json
import logging
import redis
from typing import Optional, Any
from config import settings

logger = logging.getLogger(__name__)


class RedisCache:
    """Redis-based caching layer for SQL query optimization."""

    def __init__(self):
        self.client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            db=settings.REDIS_DB,
            decode_responses=True,
        )
        self.default_ttl = settings.REDIS_CACHE_TTL
        # In-process counters for quick hit-rate inspection (reset on restart)
        self._hits: int = 0
        self._misses: int = 0

    def get(self, key: str) -> Optional[Any]:
        """Get a value from cache. Returns None if key doesn't exist."""
        try:
            value = self.client.get(key)
            if value:
                self._hits += 1
                logger.debug(f"cache hit  key={key}")
                return json.loads(value)
            self._misses += 1
            logger.debug(f"cache miss key={key}")
            return None
        except (redis.ConnectionError, json.JSONDecodeError):
            self._misses += 1
            return None

    def set(self, key: str, value: Any, ttl: int = None) -> bool:
        """Set a value in cache with optional TTL (seconds)."""
        try:
            serialized = json.dumps(value, default=str)
            self.client.setex(key, ttl or self.default_ttl, serialized)
            return True
        except (redis.ConnectionError, TypeError):
            return False

    def delete(self, key: str) -> bool:
        """Delete a key from cache."""
        try:
            self.client.delete(key)
            return True
        except redis.ConnectionError:
            return False

    def delete_pattern(self, pattern: str) -> int:
        """
        Delete all keys matching a pattern using SCAN (non-blocking).

        IMPORTANT: We use SCAN instead of KEYS so that large keyspaces do not
        freeze the Redis single thread.  SCAN iterates the keyspace in small
        increments — it may miss keys added between iterations, but that is
        acceptable for cache invalidation (the TTL is the safety net).

        For search caches (TTL 60s) prefer letting the TTL expire naturally
        rather than calling this method on every write.  This method is kept
        for explicit invalidation of entity caches only.
        """
        try:
            deleted = 0
            cursor = 0
            while True:
                cursor, keys = self.client.scan(cursor, match=pattern, count=100)
                if keys:
                    deleted += self.client.delete(*keys)
                if cursor == 0:
                    break
            return deleted
        except redis.ConnectionError:
            return 0

    def flush_all(self) -> bool:
        """Clear all cache entries (use only in tests / benchmarks)."""
        try:
            self.client.flushdb()
            return True
        except redis.ConnectionError:
            return False

    def health_check(self) -> bool:
        """Check if Redis is reachable."""
        try:
            return self.client.ping()
        except redis.ConnectionError:
            return False

    def stats(self) -> dict:
        """Return in-process hit/miss counters since last restart."""
        total = self._hits + self._misses
        return {
            "hits": self._hits,
            "misses": self._misses,
            "total": total,
            "hit_rate_pct": round(self._hits / total * 100, 1) if total else 0.0,
        }

    def reset_stats(self) -> None:
        """Reset hit/miss counters (useful at start of a benchmark run)."""
        self._hits = 0
        self._misses = 0


# Singleton cache instance
cache = RedisCache()

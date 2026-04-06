FROM python:3.11-slim

WORKDIR /app

# Install Python deps before copying code (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

EXPOSE 8000

# --host 0.0.0.0 is required so the port is reachable from outside the container
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

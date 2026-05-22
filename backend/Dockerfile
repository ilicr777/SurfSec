# Stage 1: Build dependencies
FROM python:3.11-slim as builder

WORKDIR /app
RUN python -m venv /opt/venv
# Make sure we use the virtualenv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Runtime
FROM python:3.11-slim

WORKDIR /app
# Copy the pre-built virtual environment
COPY --from=builder /opt/venv /opt/venv
# Make sure we use the virtualenv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application code
COPY . /app

# Ensure non-root user for security
RUN useradd -m appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

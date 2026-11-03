# PRISM single-service image: builds the React frontend, then serves it together with the FastAPI backend.
# Light profile (LSA retrieval, no torch). Neural embeddings: docker build --build-arg EXTRA="sentence-transformers" .
FROM node:20-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim
ARG EXTRA=""
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PRISM_ENV=production PRISM_EMBEDDINGS=lsa PRISM_STATIC_DIR=/app/static PRISM_VAR_DIR=/app/var
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt ${EXTRA}
COPY backend ./backend
COPY alembic ./alembic
COPY alembic.ini .
COPY --from=web /web/dist ./static
RUN useradd -m prism && mkdir -p /app/var && chown -R prism /app
USER prism
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request,os;urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/api/health')"
CMD ["sh", "-c", "uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]

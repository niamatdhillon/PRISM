# PRISM backend image. Default is the light profile (LSA semantic retrieval, no torch). For neural embeddings build with:
#   docker build --build-arg EXTRA="sentence-transformers" -t prism-backend .
FROM python:3.11-slim
ARG EXTRA=""
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PRISM_ENV=production PRISM_EMBEDDINGS=lsa
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt ${EXTRA}
COPY backend ./backend
COPY alembic ./alembic
COPY alembic.ini .
RUN useradd -m prism && mkdir -p /app/var && chown -R prism /app
USER prism
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request,os;urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/api/health')"
CMD ["sh", "-c", "uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install Python + pip (Debian always has them)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Install Node deps (root workspace manifest first for layer caching)
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci

# Install Python deps into a venv
COPY requirements.txt ./
RUN python3 -m venv /opt/pyenv \
    && /opt/pyenv/bin/pip install --no-cache-dir -r requirements.txt

# Copy source and build
COPY . .
RUN npm run build --workspace=frontend \
    && npm run build --workspace=backend

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-bookworm-slim

WORKDIR /app

# Runtime Python only
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy venv from builder
COPY --from=builder /opt/pyenv /opt/pyenv

# Copy built app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/frontend/node_modules ./frontend/node_modules
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY --from=builder /app/package.json ./package.json
COPY bot.py requirements.txt start.sh ./

RUN chmod +x start.sh

EXPOSE 3000

CMD ["bash", "start.sh"]

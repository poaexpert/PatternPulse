FROM node:20-bookworm-slim

WORKDIR /app

# Python + pip — Debian always has these, no Nix issues
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Install Node deps first (layer cache — only re-runs if package files change)
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci

# Copy source code (after deps so code changes don't bust the dep cache)
COPY . .

# Build
RUN npm run build --workspace=frontend
RUN npm run build --workspace=backend

# Python venv + deps
RUN python3 -m venv /opt/pyenv \
    && /opt/pyenv/bin/pip install --no-cache-dir -r requirements.txt

RUN chmod +x start.sh

EXPOSE 3000
CMD ["bash", "start.sh"]

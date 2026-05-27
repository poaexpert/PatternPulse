FROM node:20-bookworm-slim

WORKDIR /app

# Python + pip via Debian (always available, no Nix issues)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Copy everything in one shot
COPY . .

# Node.js: install all workspace deps + build
RUN npm install
RUN npm run build --workspace=frontend
RUN npm run build --workspace=backend

# Python: venv + deps
RUN python3 -m venv /opt/pyenv \
    && /opt/pyenv/bin/pip install --no-cache-dir -r requirements.txt

RUN chmod +x start.sh

EXPOSE 3000
CMD ["bash", "start.sh"]

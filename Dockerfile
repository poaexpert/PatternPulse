# Base image with Python 3.11 + Node 20 pre-installed — no apt-get needed
FROM nikolaik/python-nodejs:python3.11-nodejs20-slim

WORKDIR /app

# Python venv + deps first (cached unless requirements.txt changes)
COPY requirements.txt .
RUN python3.11 -m venv /opt/pyenv \
    && /opt/pyenv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/pyenv/bin/pip install --no-cache-dir -r requirements.txt

# Node deps (cached unless package files change)
COPY package.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm install

# Source + build
COPY . .
RUN npm run build --workspace=frontend
RUN npm run build --workspace=backend

RUN chmod +x start.sh

EXPOSE 3000
CMD ["bash", "start.sh"]

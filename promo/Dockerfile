# Render image for promo spots: Playwright/Chromium + ffmpeg + numpy/scipy,
# with the app's deps installed in /work, where pipeline.sh syncs the repo
# (Turbopack rejects a node_modules symlinked from outside the project).
# Build from the repo root: docker build -f promo/Dockerfile .
ARG PLAYWRIGHT_VERSION=1.63.0
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3-numpy python3-scipy rsync \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /work
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

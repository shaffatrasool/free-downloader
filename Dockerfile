# Multi-stage Dockerfile for Free Downloader
FROM node:20-bullseye-slim AS runner

# Install system dependencies: ffmpeg, python3, ca-certificates, curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create necessary directories
RUN mkdir -p bin temp public

# Download latest yt-dlp Linux binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /app/bin/yt-dlp \
    && chmod a+rx /app/bin/yt-dlp

# Verify yt-dlp and ffmpeg installations
RUN /app/bin/yt-dlp --version && ffmpeg -version

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Set environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

# Health check probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]

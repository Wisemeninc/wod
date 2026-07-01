# OnlyMIP WordQuiz — Word of the Day (per-day share cards)
FROM oven/bun:1.3-slim

WORKDIR /app

# Install the one dependency (resvg, for rasterizing share cards to PNG).
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# App source + bundled fonts used by the card renderer.
COPY server.ts card.ts ./
COPY data ./data
COPY assets ./assets
COPY public ./public

ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "run", "server.ts"]

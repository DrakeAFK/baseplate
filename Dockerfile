FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5173
ENV WORKSPACE_DIR=/data/workspace
ENV TZ=America/New_York

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build

EXPOSE 5173
CMD ["node", "build"]
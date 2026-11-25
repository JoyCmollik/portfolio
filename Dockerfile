FROM node:22-slim
WORKDIR /app
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
COPY apps/api/package*.json ./apps/api/
RUN npm install --no-audit --no-fund
COPY . .
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
RUN npm run build && npm prune --omit=dev && mkdir -p apps/api/uploads && chown -R node:node apps/api/uploads
ENV NODE_ENV=production PORT=4000
USER node
EXPOSE 4000
CMD ["npm", "start"]

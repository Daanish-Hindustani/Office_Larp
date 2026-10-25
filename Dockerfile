FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
COPY server ./server
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 OFFICE_DB=/app/.data/office.sqlite OFFICE_ACTIVITY_FILE=/app/.data/activity.json
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
RUN mkdir .data && chown node:node .data
USER node
EXPOSE 4173
CMD ["node", "server/index.mjs"]

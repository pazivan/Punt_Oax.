FROM node:22-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY frontend/src/utils/telefonoMx.mjs /frontend/src/utils/telefonoMx.mjs
COPY frontend/src/utils/municipios.mjs /frontend/src/utils/municipios.mjs
COPY frontend/src/data/municipios-oaxaca.json /frontend/src/data/municipios-oaxaca.json
COPY frontend/src/data/municipios-equivalencias.json /frontend/src/data/municipios-equivalencias.json
COPY db/migrations /db/migrations
EXPOSE 3000
CMD ["npm", "start"]

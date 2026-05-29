FROM node:20-alpine

WORKDIR /app

# Copia node_modules pré-instalado no host (evita problemas de
# inspeção TLS / proxy corporativo durante o build).
# Se node_modules não existir, descomente a linha RUN abaixo para instalar
# durante o build:
#   RUN npm install --omit=dev && npm cache clean --force
COPY package*.json ./
COPY node_modules ./node_modules

COPY server.js ./

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

CMD ["node", "server.js"]

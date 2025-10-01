FROM node:18-alpine

# Métadonnées
LABEL maintainer="Jeremy Polizzi <jeremy@plusdeclients.com>"
LABEL description="TickTick Orchestrator - Intelligent Task Management"

# Répertoire de travail
WORKDIR /app

# Installation des dépendances système
RUN apk add --no-cache curl

# Copie des fichiers de configuration
COPY package*.json ./

# Installation des dépendances Node.js
RUN npm ci --only=production && npm cache clean --force

# Copie du code source
COPY src/ ./src/
COPY data/ ./data/

# Création des répertoires nécessaires
RUN mkdir -p data/logs data/backup && \
    chown -R node:node /app

# Utilisateur non-root pour la sécurité
USER node

# Variables d'environnement par défaut
ENV NODE_ENV=production
ENV PORT=3000

# Port exposé
EXPOSE 3000

# Vérification de santé
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Commande de démarrage
CMD ["node", "src/app.js"]
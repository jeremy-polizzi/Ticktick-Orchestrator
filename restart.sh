#!/bin/bash
# Script de redémarrage automatique du serveur

# Obtenir le répertoire du script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Tuer tous les processus Node.js du serveur
pkill -f "node src/app.js" 2>/dev/null
pkill -f "npm start" 2>/dev/null
lsof -ti:3000,3443 | xargs kill -9 2>/dev/null

# Attendre que les ports soient libérés
sleep 2

# Redémarrer le serveur
npm start > /tmp/orchestrator.log 2>&1 &

echo "✅ Serveur redémarré"

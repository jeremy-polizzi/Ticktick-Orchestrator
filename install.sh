#!/bin/bash

# ===================================================
# 🎯 TickTick Orchestrator - Script Installation VPS
# ===================================================
# Installation automatique complète sur Ubuntu/Debian
# Inclut: Node.js, dépendances, configuration, PM2
# ===================================================

set -e  # Arrêter si erreur

# Couleurs pour output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  🎯 TickTick Orchestrator - Installation    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ===== VÉRIFICATIONS PRÉREQUIS =====

echo -e "${YELLOW}[1/8]${NC} Vérification prérequis..."

# Vérifier OS
if [[ ! -f /etc/os-release ]]; then
    echo -e "${RED}❌ OS non supporté (besoin Ubuntu/Debian)${NC}"
    exit 1
fi

source /etc/os-release
if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
    echo -e "${RED}❌ OS non supporté: $ID (besoin Ubuntu/Debian)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ OS supporté: $PRETTY_NAME${NC}"

# Vérifier droits root/sudo
if [[ $EUID -ne 0 ]]; then
    if ! command -v sudo &> /dev/null; then
        echo -e "${RED}❌ Besoin des droits root ou sudo${NC}"
        exit 1
    fi
    SUDO="sudo"
    echo -e "${GREEN}✅ Sudo disponible${NC}"
else
    SUDO=""
    echo -e "${GREEN}✅ Droits root${NC}"
fi

# ===== INSTALLATION NODE.JS =====

echo ""
echo -e "${YELLOW}[2/8]${NC} Installation Node.js 18+..."

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 18 ]; then
        echo -e "${GREEN}✅ Node.js $(node -v) déjà installé${NC}"
    else
        echo -e "${YELLOW}⚠️  Node.js $(node -v) trop ancien, mise à jour...${NC}"
        curl -fsSL https://deb.nodesource.com/setup_18.x | $SUDO -E bash -
        $SUDO apt-get install -y nodejs
        echo -e "${GREEN}✅ Node.js $(node -v) installé${NC}"
    fi
else
    echo -e "${YELLOW}📦 Installation Node.js...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | $SUDO -E bash -
    $SUDO apt-get install -y nodejs
    echo -e "${GREEN}✅ Node.js $(node -v) installé${NC}"
fi

# ===== INSTALLATION DÉPENDANCES NPM =====

echo ""
echo -e "${YELLOW}[3/8]${NC} Installation dépendances NPM..."

if [[ ! -f package.json ]]; then
    echo -e "${RED}❌ package.json introuvable (êtes-vous dans le bon dossier?)${NC}"
    exit 1
fi

npm install --production
echo -e "${GREEN}✅ Dépendances installées${NC}"

# ===== CONFIGURATION ENVIRONNEMENT =====

echo ""
echo -e "${YELLOW}[4/8]${NC} Configuration environnement..."

if [[ ! -f .env ]]; then
    if [[ -f .env.example ]]; then
        cp .env.example .env
        echo -e "${GREEN}✅ Fichier .env créé depuis .env.example${NC}"
        echo -e "${YELLOW}⚠️  IMPORTANT: Éditez .env avec vos clés API!${NC}"
        echo -e "${BLUE}   nano .env${NC}"
    else
        echo -e "${YELLOW}⚠️  Aucun .env.example trouvé${NC}"
        cat > .env << 'EOF'
# TickTick API
TICKTICK_CLIENT_ID=
TICKTICK_CLIENT_SECRET=
TICKTICK_REDIRECT_URI=

# Google Calendar API
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# Configuration
PORT=3000
NODE_ENV=production
EOF
        echo -e "${GREEN}✅ Fichier .env créé${NC}"
        echo -e "${YELLOW}⚠️  IMPORTANT: Éditez .env avec vos clés API!${NC}"
        echo -e "${BLUE}   nano .env${NC}"
    fi
else
    echo -e "${GREEN}✅ Fichier .env existe déjà${NC}"
fi

# ===== CRÉATION DOSSIERS DATA =====

echo ""
echo -e "${YELLOW}[5/8]${NC} Création dossiers data..."

mkdir -p data/logs data/tokens data/cache
chmod -R 755 data
echo -e "${GREEN}✅ Dossiers créés${NC}"

# ===== INSTALLATION PM2 =====

echo ""
echo -e "${YELLOW}[6/8]${NC} Installation PM2..."

if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}✅ PM2 déjà installé${NC}"
else
    $SUDO npm install -g pm2
    echo -e "${GREEN}✅ PM2 installé${NC}"
fi

# ===== CONFIGURATION PM2 =====

echo ""
echo -e "${YELLOW}[7/8]${NC} Configuration PM2..."

# Créer ecosystem.config.js si absent
if [[ ! -f ecosystem.config.js ]]; then
    cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'ticktick-orchestrator',
    script: './src/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './data/logs/pm2-error.log',
    out_file: './data/logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
EOF
    echo -e "${GREEN}✅ ecosystem.config.js créé${NC}"
else
    echo -e "${GREEN}✅ ecosystem.config.js existe déjà${NC}"
fi

# ===== DÉMARRAGE APPLICATION =====

echo ""
echo -e "${YELLOW}[8/8]${NC} Démarrage application..."

# Vérifier si déjà lancé
if pm2 list | grep -q "ticktick-orchestrator"; then
    echo -e "${YELLOW}⚠️  Application déjà lancée, redémarrage...${NC}"
    pm2 restart ticktick-orchestrator
else
    pm2 start ecosystem.config.js
fi

pm2 save
$SUDO pm2 startup | grep "sudo" | bash || true

echo -e "${GREEN}✅ Application démarrée${NC}"

# ===== RÉCAPITULATIF =====

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ Installation terminée avec succès!      ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Obtenir IP publique
PUBLIC_IP=$(curl -s ifconfig.me || echo "IP_NON_DETECTEE")

echo -e "${BLUE}📋 Prochaines étapes:${NC}"
echo ""
echo -e "1️⃣  ${YELLOW}Configurer les clés API${NC}"
echo -e "   ${BLUE}nano .env${NC}"
echo ""
echo -e "2️⃣  ${YELLOW}Accéder à l'interface web${NC}"
echo -e "   ${BLUE}http://$PUBLIC_IP:3000${NC}"
echo ""
echo -e "3️⃣  ${YELLOW}Commandes utiles${NC}"
echo -e "   ${BLUE}pm2 status${NC}            - Voir statut"
echo -e "   ${BLUE}pm2 logs${NC}              - Voir logs temps réel"
echo -e "   ${BLUE}pm2 restart all${NC}       - Redémarrer"
echo -e "   ${BLUE}pm2 stop all${NC}          - Arrêter"
echo ""

# Vérifier si .env contient des clés vides
if grep -q "TICKTICK_CLIENT_ID=$" .env 2>/dev/null; then
    echo -e "${RED}⚠️  ATTENTION: .env contient des clés vides!${NC}"
    echo -e "${YELLOW}   Éditez .env avant d'utiliser l'orchestrateur${NC}"
    echo ""
fi

echo -e "${GREEN}✨ Installation terminée!${NC}"
echo ""

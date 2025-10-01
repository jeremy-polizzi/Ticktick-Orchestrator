# 🚀 Installation - TickTick Orchestrator

Guide d'installation complet pour l'orchestrateur intelligent TickTick.

## 📋 Prérequis

### Système
- **Node.js** ≥ 18.0.0
- **npm** ≥ 8.0.0
- **Docker** (optionnel, recommandé)
- **Git**

### Comptes et API
1. **Compte TickTick** avec API access
2. **Compte Google** avec Google Calendar API activé
3. **Serveur Linux/macOS/Windows** avec accès Internet

## ⚡ Installation Rapide (Docker)

### 1. Cloner le Projet
```bash
git clone https://github.com/jeremy-polizzi/Ticktick-Orchestrator.git
cd Ticktick-Orchestrator
```

### 2. Configuration
```bash
# Copier le template de configuration
cp .env.example .env

# Éditer les variables d'environnement
nano .env
```

### 3. Variables d'Environnement Requises
```env
# Server
PORT=3000
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key-here
ADMIN_PASSWORD=your-admin-password

# TickTick API
TICKTICK_CLIENT_ID=your-ticktick-client-id
TICKTICK_CLIENT_SECRET=your-ticktick-client-secret

# Google Calendar API
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Calendars
JEREMY_CALENDAR_ID=jeremy.polizzie@gmail.com
BUSINESS_CALENDAR_ID=plusdeclients@gmail.com
```

### 4. Lancement Docker
```bash
# Construire et démarrer
docker-compose up -d

# Vérifier les logs
docker-compose logs -f
```

### 5. Accès
- **Interface Web** : http://localhost:3000
- **API** : http://localhost:3000/api
- **Health Check** : http://localhost:3000/health

## 🔧 Installation Manuelle

### 1. Prérequis Node.js
```bash
# Vérifier Node.js et npm
node --version  # ≥ 18.0.0
npm --version   # ≥ 8.0.0

# Si nécessaire, installer Node.js
# macOS
brew install node

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Installation des Dépendances
```bash
cd Ticktick-Orchestrator
npm install
```

### 3. Configuration Base de Données
```bash
# Créer les répertoires nécessaires
mkdir -p data/logs data/backup data/tokens

# Permissions (Linux/macOS)
chmod 755 data
chmod 755 data/logs
chmod 755 data/backup
chmod 755 data/tokens
```

### 4. Configuration des Variables
```bash
# Copier et éditer .env
cp .env.example .env
nano .env

# Générer un secret JWT fort
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 5. Tests Préliminaires
```bash
# Tester l'application
npm test

# Vérifier la configuration
npm run setup
```

### 6. Démarrage
```bash
# Mode développement
npm run dev

# Mode production
npm start

# Scheduler en background
npm run scheduler
```

## 🔑 Configuration des APIs

### TickTick API

#### 1. Création App TickTick
1. Aller sur [TickTick Developer Console](https://developer.ticktick.com)
2. Créer une nouvelle application
3. Noter `Client ID` et `Client Secret`
4. Configurer l'URL de callback : `http://localhost:3000/auth/ticktick/callback`

#### 2. Scopes Requis
- `tasks:read` - Lecture des tâches
- `tasks:write` - Modification des tâches

### Google Calendar API

#### 1. Configuration Google Cloud Console
```bash
# 1. Aller sur https://console.cloud.google.com/
# 2. Créer un nouveau projet ou sélectionner existant
# 3. Activer Google Calendar API
# 4. Créer des identifiants OAuth 2.0
```

#### 2. Configuration OAuth
- **Type d'application** : Application Web
- **URIs de redirection autorisées** :
  - `http://localhost:3000/auth/google/callback`
  - `https://votre-domaine.com/auth/google/callback`

#### 3. Scopes Requis
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/calendar.events`

## 🔐 Première Connexion

### 1. Authentification Admin
```bash
# Démarrer l'application
npm start

# Aller sur http://localhost:3000
# Se connecter avec ADMIN_PASSWORD
```

### 2. Configuration TickTick
1. Cliquer sur "Paramètres" → "Authentification"
2. Cliquer sur "Connecter TickTick"
3. Suivre le processus OAuth
4. Vérifier la connexion

### 3. Configuration Google Calendar
1. Cliquer sur "Connecter Google Calendar"
2. Suivre le processus OAuth
3. Autoriser l'accès aux calendriers
4. Vérifier la connexion

## ⏰ Configuration du Scheduler

### 1. Cron Automatique
```bash
# Ajouter au crontab
crontab -e

# Ajouter cette ligne pour exécution quotidienne à 6h
0 6 * * * /usr/bin/node /path/to/Ticktick-Orchestrator/src/scheduler/daily-scheduler.js --run-once >> /var/log/ticktick-orchestrator.log 2>&1
```

### 2. Service Systemd (Linux)
```bash
# Créer le service
sudo nano /etc/systemd/system/ticktick-orchestrator.service
```

```ini
[Unit]
Description=TickTick Orchestrator
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/Ticktick-Orchestrator
ExecStart=/usr/bin/node src/app.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
# Activer et démarrer
sudo systemctl enable ticktick-orchestrator
sudo systemctl start ticktick-orchestrator
sudo systemctl status ticktick-orchestrator
```

## 🔍 Vérification Installation

### 1. Health Checks
```bash
# API Health
curl http://localhost:3000/health

# Statut des services
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/scheduler/health

# Connexions APIs
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/auth/status
```

### 2. Tests Fonctionnels
```bash
# Test de commande naturelle
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"command": "lister toutes les tâches"}' \
  http://localhost:3000/api/tasks/command

# Test de synchronisation
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/calendar/sync/full
```

### 3. Logs
```bash
# Logs application
tail -f data/logs/orchestrator.log

# Logs erreurs
tail -f data/logs/error.log

# Logs actions
tail -f data/logs/actions.log
```

## 🐛 Dépannage

### Problèmes Courants

#### 1. Erreur de Port
```bash
# Port 3000 déjà utilisé
ERROR: Port 3000 is already in use

# Solution: Changer le port
echo "PORT=3001" >> .env
```

#### 2. Erreurs d'Authentification
```bash
# Tokens expirés ou invalides
ERROR: Token invalide ou expiré

# Solutions:
# 1. Vérifier les variables d'environnement
# 2. Réinitialiser l'authentification
# 3. Vérifier les URLs de callback
```

#### 3. Erreurs de Base de Données
```bash
# Permissions insuffisantes
ERROR: EACCES: permission denied

# Solution: Corriger les permissions
chmod -R 755 data/
chown -R $USER:$USER data/
```

#### 4. Erreurs de Synchronisation
```bash
# Problème de connectivité
ERROR: Connexion TickTick échouée

# Solutions:
# 1. Vérifier la connexion Internet
# 2. Vérifier les credentials API
# 3. Consulter les logs détaillés
```

### Commandes de Diagnostic
```bash
# Informations système
npm run info

# Test de configuration
npm run test:config

# Nettoyage des données
npm run clean

# Réinitialisation complète
npm run reset
```

## 🔄 Migration et Sauvegarde

### Sauvegarde
```bash
# Sauvegarder la configuration
cp .env .env.backup

# Sauvegarder les données
tar -czf backup-$(date +%Y%m%d).tar.gz data/

# Sauvegarder les tokens (si nécessaire)
cp -r data/tokens/ tokens-backup/
```

### Migration vers Nouveau Serveur
```bash
# 1. Cloner le projet
git clone https://github.com/jeremy-polizzi/Ticktick-Orchestrator.git

# 2. Restaurer la configuration
cp .env.backup .env

# 3. Restaurer les données
tar -xzf backup-20241001.tar.gz

# 4. Installer et démarrer
npm install
npm start
```

## 📈 Optimisation Performance

### 1. Configuration Production
```env
NODE_ENV=production
LOG_LEVEL=warn
RATE_LIMIT_MAX_REQUESTS=1000
SYNC_INTERVAL_MINUTES=15
```

### 2. Monitoring
```bash
# Installer PM2 pour monitoring
npm install -g pm2

# Démarrer avec PM2
pm2 start ecosystem.config.js

# Monitoring
pm2 monit
```

### 3. Reverse Proxy (Nginx)
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## ✅ Checklist Post-Installation

- [ ] Application démarrée sans erreurs
- [ ] Interface web accessible
- [ ] Authentification admin fonctionnelle
- [ ] TickTick connecté et synchronisé
- [ ] Google Calendar connecté
- [ ] Scheduler configuré et actif
- [ ] Tests de commandes naturelles réussis
- [ ] Logs configurés et accessibles
- [ ] Sauvegarde automatique configurée
- [ ] Monitoring en place

## 🆘 Support

En cas de problème :

1. **Logs** : Consulter `data/logs/error.log`
2. **Documentation** : [GitHub Issues](https://github.com/jeremy-polizzi/Ticktick-Orchestrator/issues)
3. **Configuration** : Vérifier `.env` et variables
4. **API Status** : Tester `/health` et `/api/status`

---

**Installation réussie !** 🎉

L'orchestrateur TickTick est maintenant opérationnel. Consultez le [Guide d'Utilisation](USAGE.md) pour commencer à optimiser votre productivité.
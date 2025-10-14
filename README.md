# 🎯 TickTick Orchestrator

**Orchestrateur intelligent autonome pour TickTick** - Gestion, organisation et synchronisation automatique des tâches avec Google Agenda.

![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)
![Node](https://img.shields.io/badge/Node.js-18+-green.svg?style=for-the-badge)
![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg?style=for-the-badge)

## ✨ Fonctionnalités

### 🚀 Actions Automatiques (Sans Confirmation)
- ✏️ **Gestion de tâches** : modification, tags, dates, suppression
- 📊 **Actions en masse** : traitement de multiples tâches simultanément
- 🤖 **Réorganisation intelligente** : priorisation automatique quotidienne
- 🔄 **Synchronisation bidirectionnelle** avec Google Calendar

### 🧠 Intelligence Intégrée
- 📈 **Calcul de perplexité** : estimation automatique de la complexité des tâches
- 📅 **Planification optimale** : distribution équilibrée sur les journées
- 🎯 **Respect des choix utilisateur** : préservation des modifications manuelles

### 🌐 Interface Web Moderne
- 💬 **Commandes en langage naturel**
- ⚡ **Actions rapides** sans friction
- 📋 **Visualisation temps réel** des tâches
- 📊 **Historique et logs** détaillés
- 🎨 **Design responsive** et centré
- 🔧 **Configuration dynamique** avec détection auto du domaine/IP

## 🚀 Installation VPS (Production)

### Installation Automatique (Recommandée) ⚡

**Une seule commande pour tout installer:**

```bash
git clone https://github.com/jeremy-polizzi/Ticktick-Orchestrator.git
cd Ticktick-Orchestrator
chmod +x install.sh
./install.sh
```

Le script installe automatiquement:
- ✅ Node.js 18+ (si absent)
- ✅ Dépendances NPM
- ✅ Configuration .env
- ✅ PM2 + démarrage auto
- ✅ Dossiers data/

**Après installation:**
1. Éditer `.env` avec vos clés API
2. Accéder à `http://VOTRE_IP:3000`
3. Configurer OAuth TickTick & Google

### Prérequis
- Ubuntu 20.04+ / Debian 11+
- Accès root ou sudo
- (Optionnel) Domaine pour HTTPS

### Installation Manuelle (Avancée)

Si vous préférez installer manuellement:

```bash
# 1. Installer Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Cloner le projet
git clone https://github.com/jeremy-polizzi/Ticktick-Orchestrator.git
cd Ticktick-Orchestrator

# 3. Installer les dépendances
npm install --production

# 4. Configurer les variables d'environnement
cp .env.example .env
nano .env  # Éditer avec vos clés API

# 5. Installer et configurer PM2
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# 6. (Optionnel) Installer Nginx + SSL
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Créer le fichier de configuration Nginx
sudo nano /etc/nginx/sites-available/orchestrator.votre-domaine.com
```

**Configuration Nginx** (adapter `orchestrator.votre-domaine.com`):

```nginx
server {
    listen 80;
    server_name orchestrator.votre-domaine.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

```bash
# Activer le site et obtenir le certificat SSL
sudo ln -s /etc/nginx/sites-available/orchestrator.votre-domaine.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Obtenir certificat SSL Let's Encrypt
sudo certbot --nginx -d orchestrator.votre-domaine.com --redirect --agree-tos -m votre@email.com -n

# 6. Démarrer l'application
npm start

# Ou avec PM2 pour la production
npm install -g pm2
pm2 start src/app.js --name ticktick-orchestrator
pm2 startup
pm2 save
```

### 🔧 Détection Automatique Domaine/IP

L'orchestrateur détecte **automatiquement** votre domaine ou IP:

- ✅ **Avec domaine** : `https://orchestrator.votre-domaine.com`
- ✅ **Sans domaine** : `https://IP.de.votre.VPS:3000`
- ✅ **Localhost** : `http://localhost:3000`

**Les redirect URIs OAuth sont générés automatiquement** pour s'adapter à votre configuration!

## ⚙️ Configuration

### Variables d'environnement (.env)

```bash
# Serveur
PORT=3000
NODE_ENV=production
JWT_SECRET=votre-secret-jwt-tres-securise
ADMIN_PASSWORD=votre-mot-de-passe-admin

# TickTick API (depuis https://developer.ticktick.com/manage)
TICKTICK_CLIENT_ID=votre_client_id
TICKTICK_CLIENT_SECRET=votre_client_secret
# TICKTICK_REDIRECT_URI=  # Optionnel - auto-détecté si vide

# Google Calendar API (depuis https://console.cloud.google.com/apis/credentials)
GOOGLE_CLIENT_ID=votre_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=votre_client_secret
# GOOGLE_REDIRECT_URI=  # Optionnel - auto-détecté si vide

# Calendriers à synchroniser
JEREMY_CALENDAR_ID=votre@email.com
BUSINESS_CALENDAR_ID=business@email.com

# Scheduler
DAILY_SCHEDULER_TIME=06:00
SYNC_INTERVAL_MINUTES=30
MAX_DAILY_TASKS=3
```

### 🔑 Obtenir les Clés API

#### TickTick Developer
1. Visitez [TickTick Developer Console](https://developer.ticktick.com/manage)
2. Connectez-vous avec votre compte TickTick
3. Créez une nouvelle application
4. Copiez **Client ID** et **Client Secret**
5. Ajoutez redirect URI (auto-détecté par l'interface web)

#### Google Cloud Console
1. Visitez [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Créez un projet ou sélectionnez-en un
3. Activez **Google Calendar API**
4. Créez des identifiants OAuth 2.0 Client ID
5. Type: **Web application**
6. Ajoutez redirect URI (auto-détecté par l'interface web)

## 🎯 Utilisation

### Interface Web
```
https://orchestrator.votre-domaine.com
```

**Login:** Utilisez le `ADMIN_PASSWORD` configuré dans `.env`

### Configuration Initiale
1. **Connectez-vous** à l'interface web
2. Allez dans **Configuration**
3. **Sauvegardez** vos clés API TickTick et Google
4. **Autorisez** TickTick (bouton "Connecter")
5. **Autorisez** Google Calendar (bouton "Connecter")
6. ✅ **Prêt!** Les redirect URIs sont détectés automatiquement

### Commandes Naturelles
- `"Déplacer toutes les tâches #urgent vers Aujourd'hui"`
- `"Prioriser les tâches de développement pour demain"`
- `"Supprimer les tâches terminées de la semaine"`
- `"Synchroniser avec Google Calendar"`

### Automatisation
- **Scheduler quotidien** : réorganisation automatique à 6h
- **Synchronisation** : bidirectionnelle avec Google Calendar toutes les 30 minutes
- **Priorisation** : 1-3 tâches importantes par jour

## 🏗️ Architecture

```
Ticktick-Orchestrator/
├── src/
│   ├── api/                    # Intégrations APIs
│   │   ├── ticktick-api.js    # Client TickTick OAuth2
│   │   └── google-calendar-api.js  # Client Google Calendar
│   ├── orchestrator/          # Logique métier
│   │   ├── task-manager.js   # Gestion des tâches
│   │   ├── priority-calculator.js  # Calcul perplexité
│   │   └── calendar-sync.js  # Synchronisation bidirectionnelle
│   ├── scheduler/             # Automation
│   │   └── daily-scheduler.js  # Cron jobs quotidiens
│   ├── web/                   # Interface web
│   │   ├── routes/           # API REST + pages HTML
│   │   ├── middleware/       # Auth JWT
│   │   └── public/           # Frontend (HTML/CSS/JS)
│   ├── config/               # Configuration
│   │   └── config.js        # Auto-détection domaine/IP
│   ├── utils/               # Utilitaires
│   │   └── logger.js       # Logging Winston
│   └── app.js              # Point d'entrée Express
├── data/                   # Données persistantes
│   ├── tokens/            # Tokens OAuth (sécurisés)
│   ├── logs/             # Logs applicatifs
│   └── backup/           # Sauvegardes automatiques
├── tests/               # Tests automatisés
├── docs/               # Documentation
│   ├── API.md         # Documentation API
│   └── INSTALLATION.md  # Guide installation
├── .env.example       # Template configuration
├── package.json      # Dépendances Node.js
└── README.md        # Ce fichier
```

## 🔒 Sécurité

- 🔐 **Chiffrement** des tokens OAuth stockés sur disque
- 🔒 **Authentification JWT** pour l'interface web
- 🛡️ **Helmet.js** : headers sécurisés (CSP, HSTS, etc.)
- 🚫 **Rate limiting** : protection contre les abus API
- 📝 **Logs d'audit** complets avec Winston
- 💾 **Sauvegarde** automatique des données
- 🔑 **HTTPS uniquement** en production (Nginx + Let's Encrypt)

## 📈 Performance

- ⚡ Interface < 200ms
- 🔄 Synchronisation complète < 30s
- 📊 Support 1000+ tâches simultanées
- ♻️ Gestion intelligente des erreurs réseau
- 🔋 Faible consommation mémoire (~150MB)

## 🐳 Docker (Alternative)

```bash
# Lancement avec Docker Compose
docker-compose up -d

# Voir les logs
docker-compose logs -f

# Arrêter
docker-compose down
```

## 🔧 Maintenance

### Logs
```bash
# Logs en temps réel
tail -f data/logs/orchestrator.log

# Logs PM2
pm2 logs ticktick-orchestrator
```

### Mises à jour
```bash
# Récupérer les dernières modifications
git pull origin main

# Installer les nouvelles dépendances
npm install

# Redémarrer
pm2 restart ticktick-orchestrator
```

### Backup
```bash
# Sauvegarder les tokens et données
tar -czf backup-$(date +%Y%m%d).tar.gz data/

# Restaurer depuis backup
tar -xzf backup-20240101.tar.gz
```

## 🐛 Dépannage

### Les redirect URIs ne fonctionnent pas
- ✅ Vérifiez que Nginx transmet les headers `X-Forwarded-*`
- ✅ Vérifiez que `trust proxy` est activé dans Express
- ✅ Consultez les logs : `tail -f data/logs/orchestrator.log`

### L'authentification OAuth échoue
- ✅ Vérifiez les redirect URIs dans les consoles TickTick/Google
- ✅ Utilisez les URIs affichées dans l'interface web (auto-détectées)
- ✅ Vérifiez que SSL/HTTPS fonctionne correctement

### Erreur 502 Bad Gateway
- ✅ Vérifiez que le serveur Node.js tourne : `pm2 status`
- ✅ Vérifiez les logs : `pm2 logs ticktick-orchestrator`
- ✅ Redémarrez : `pm2 restart ticktick-orchestrator`

## 🔧 Corrections Récentes

### ✅ Fix TickTick updateTask (2025-10-14)

**Problème résolu:** L'API TickTick acceptait les mises à jour (HTTP 200 OK) mais ne sauvegardait pas les modifications.

**Solution:** TickTick nécessite obligatoirement 3 champs pour toute modification:
```javascript
{
  id: "task_id",           // ✅ OBLIGATOIRE
  projectId: "project_id", // ✅ OBLIGATOIRE
  title: "Task title",     // ✅ OBLIGATOIRE
  dueDate: "2025-10-15T12:00:00+0000"  // + modifications
}
```

**Impact:** L'orchestrateur peut maintenant réellement assigner et modifier les dates des tâches TickTick.

📖 **Documentation complète:** [docs/TICKTICK-UPDATE-FIX.md](docs/TICKTICK-UPDATE-FIX.md)

## 🤝 Contribution

Ce projet suit les standards **GitHub Flow** avec protection de la branche `main`.

```bash
# Créer une branche feature
git checkout -b feature/ma-fonctionnalite

# Commiter vos changements
git add .
git commit -m "feat: description de la fonctionnalité"

# Pusher et créer une PR
git push origin feature/ma-fonctionnalite
```

## 📄 License

MIT - Voir [LICENSE](LICENSE) pour plus de détails.

---

**Développé pour Plus de Clients** - Optimisation productivité Jeremy Polizzi
🔗 GitHub: [@jeremy-polizzi](https://github.com/jeremy-polizzi)

# 🚀 Déploiement - TickTick Orchestrator

## URLs de Production

### ⚠️ URL CORRECTE (2025)
```
https://orchestrator.plus-de-clients.fr
```

### ❌ ANCIENNES URLs (NE PLUS UTILISER)
- ~~https://vps.plus-de-clients.fr~~ (obsolète)

## Architecture Déploiement

```
Internet
    ↓
Nginx (SSL/TLS) :443
    ↓
TickTick Orchestrator :3000 (localhost)
```

## Configuration Nginx

**Fichier**: `/etc/nginx/sites-available/orchestrator`

```nginx
server {
    listen 443 ssl http2;
    server_name orchestrator.plus-de-clients.fr;

    # SSL géré par Certbot
    ssl_certificate /etc/letsencrypt/live/orchestrator.plus-de-clients.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/orchestrator.plus-de-clients.fr/privkey.pem;

    # Reverse proxy vers Node.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Timeouts pour requêtes longues (snapshots, restauration)
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}

# Redirection HTTP → HTTPS
server {
    listen 80;
    server_name orchestrator.plus-de-clients.fr;
    return 301 https://$server_name$request_uri;
}
```

## Variables d'Environnement Production

**Fichier**: `/root/Ticktick-Orchestrator/.env`

```bash
# Serveur
NODE_ENV=production
PORT=3000
PUBLIC_URL=https://orchestrator.plus-de-clients.fr

# Sécurité
JWT_SECRET=<secret-production>
ADMIN_PASSWORD=<password-production>

# Rate Limiting
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=500

# TickTick
TICKTICK_CLIENT_ID=<client-id>
TICKTICK_CLIENT_SECRET=<client-secret>
TICKTICK_REDIRECT_URI=https://orchestrator.plus-de-clients.fr/auth/ticktick/callback

# Google Calendar
GOOGLE_CLIENT_ID=<client-id>
GOOGLE_CLIENT_SECRET=<client-secret>
GOOGLE_REDIRECT_URI=https://orchestrator.plus-de-clients.fr/auth/google/callback

# Airtable
AIRTABLE_API_KEY=<api-key>
AIRTABLE_BASE_ID=<base-id>

# Scheduler
SCHEDULER_TIMEZONE=Europe/Paris
SCHEDULER_DAILY_TIME=06:00
SCHEDULER_CLEANUP_TIME=22:00

# Backup
BACKUP_MAX_SNAPSHOTS=30
BACKUP_DIR=./data/backups
```

## Démarrage Production

### Avec PM2 (recommandé)

```bash
# Installation PM2
npm install -g pm2

# Démarrage
pm2 start src/app.js --name ticktick-orchestrator

# Auto-restart au boot
pm2 startup
pm2 save

# Monitoring
pm2 status
pm2 logs ticktick-orchestrator
pm2 monit
```

### Avec systemd

**Fichier**: `/etc/systemd/system/ticktick-orchestrator.service`

```ini
[Unit]
Description=TickTick Orchestrator
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/Ticktick-Orchestrator
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/app.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Activer et démarrer
systemctl enable ticktick-orchestrator
systemctl start ticktick-orchestrator

# Status
systemctl status ticktick-orchestrator

# Logs
journalctl -u ticktick-orchestrator -f
```

## URLs Disponibles

### Interface Web
- **Login**: `https://orchestrator.plus-de-clients.fr/login`
- **Dashboard**: `https://orchestrator.plus-de-clients.fr/dashboard`
- **Configuration**: `https://orchestrator.plus-de-clients.fr/config`
- **Backup/Restore**: `https://orchestrator.plus-de-clients.fr/backup`

### API Endpoints

**Authentification**
- `POST /auth/login` - Login admin
- `POST /auth/ticktick` - OAuth TickTick
- `POST /auth/google` - OAuth Google

**Scheduler**
- `GET /api/scheduler/status` - Statut scheduler
- `POST /api/scheduler/start` - Démarrer
- `POST /api/scheduler/stop` - Arrêter
- `POST /api/scheduler/run` - Exécution manuelle

**Dashboard**
- `GET /api/dashboard/cap-numerique` - Dashboard Cap Numérique
- `POST /api/dashboard/cap-numerique/analyze` - Analyse manuelle
- `GET /api/dashboard/cap-numerique/suggestions` - Suggestions

**Backup**
- `POST /api/backup/snapshot` - Créer snapshot
- `GET /api/backup/list` - Lister snapshots
- `POST /api/backup/restore/:id` - Restaurer
- `GET /api/backup/chaos-check` - Vérifier chaos
- `DELETE /api/backup/:id` - Supprimer snapshot

**Tasks & Calendar**
- `GET /api/tasks` - Lister tâches
- `GET /api/calendar/events` - Lister événements
- `POST /api/calendar/sync` - Synchronisation manuelle

## Maintenance

### Mise à jour

```bash
cd /root/Ticktick-Orchestrator
git pull origin main
npm install
pm2 restart ticktick-orchestrator
```

### Logs

```bash
# Logs applicatifs
tail -f data/logs/orchestrator.log

# Logs PM2
pm2 logs ticktick-orchestrator

# Logs système
journalctl -u ticktick-orchestrator -f
```

### Backups

**Snapshots automatiques**: Créés quotidiennement à 6h avant analyse SmartOrchestrator

**Stockage**: `/root/Ticktick-Orchestrator/data/backups/`

**Rétention**: 30 jours (nettoyage automatique)

**Restauration manuelle**:
```bash
# Via API
curl -X POST https://orchestrator.plus-de-clients.fr/api/backup/restore/snapshot_XXXXX \
  -H "Authorization: Bearer $TOKEN"

# Via interface web
https://orchestrator.plus-de-clients.fr/backup
```

### Monitoring

**Health check**:
```bash
curl https://orchestrator.plus-de-clients.fr/health
```

**Chaos check**:
```bash
curl https://orchestrator.plus-de-clients.fr/api/backup/chaos-check \
  -H "Authorization: Bearer $TOKEN"
```

## Sécurité

- ✅ HTTPS obligatoire (Let's Encrypt)
- ✅ Authentification JWT sur toutes routes API
- ✅ Rate limiting: 500 req/15min
- ✅ Helmet.js (sécurité headers)
- ✅ CORS configuré
- ✅ Cookies httpOnly sécurisés
- ✅ Variables sensibles dans .env (non commité)

## Support

**Issues**: https://github.com/[owner]/Ticktick-Orchestrator/issues

**Contact**: jeremy@plusdeclients.fr

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

### 🌐 Interface Web
- 💬 **Commandes en langage naturel**
- ⚡ **Actions rapides** sans friction
- 📋 **Visualisation temps réel** des tâches
- 📊 **Historique et logs** détaillés

## 🚀 Installation Rapide

```bash
# Cloner le projet
git clone https://github.com/jeremy-polizzi/Ticktick-Orchestrator.git
cd Ticktick-Orchestrator

# Lancement avec Docker
docker-compose up -d

# Ou installation locale
npm install
npm start
```

## ⚙️ Configuration

1. **Authentification TickTick** (OAuth2 - une seule fois)
2. **Connexion Google Calendar** (OAuth2 - une seule fois)
3. **Sélection des agendas** à synchroniser
4. **Paramétrage des règles** de priorisation

## 🎯 Utilisation

### Interface Web
```
http://localhost:3000
```

### Commandes Naturelles
- `"Déplacer toutes les tâches #urgent vers Aujourd'hui"`
- `"Prioriser les tâches de développement pour demain"`
- `"Supprimer les tâches terminées de la semaine"`

### Automatisation
- **Scheduler quotidien** : réorganisation automatique à 6h
- **Synchronisation** : bidirectionnelle avec Google Calendar
- **Priorisation** : 1-3 tâches importantes par jour

## 🏗️ Architecture

```
Ticktick-Orchestrator/
├── src/
│   ├── api/              # Intégrations TickTick & Google
│   ├── orchestrator/     # Logique de priorisation
│   ├── scheduler/        # Automation et cron jobs
│   ├── web/              # Interface utilisateur
│   └── config/           # Configuration
├── data/                 # Persistance locale
├── tests/               # Tests automatisés
├── docker-compose.yml   # Déploiement
└── docs/               # Documentation
```

## 🔒 Sécurité

- 🔐 **Chiffrement** des tokens OAuth
- 🔒 **Authentification** interface web
- 📝 **Logs d'audit** complets
- 💾 **Sauvegarde** automatique

## 📈 Performance

- ⚡ Interface < 200ms
- 🔄 Synchronisation < 30s
- 📊 Support 1000+ tâches
- ♻️ Gestion erreurs réseau

## 🤝 Contribution

Ce projet suit les standards GitHub Flow avec protection de la branche main.

## 📄 License

MIT - Voir [LICENSE](LICENSE) pour plus de détails.

---

**Développé pour Plus de Clients** - Optimisation productivité Jeremy Polizzi
# 📡 API Documentation - TickTick Orchestrator

Documentation complète de l'API REST de l'orchestrateur TickTick.

## 🚀 Base URL

```
http://localhost:3000/api
```

## 🔐 Authentification

### Headers Requis
```http
Authorization: Bearer <token>
Content-Type: application/json
```

### Obtenir un Token
```http
POST /auth/login
Content-Type: application/json

{
  "password": "admin-password"
}
```

**Réponse :**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "username": "admin",
    "role": "admin",
    "permissions": ["read", "write", "admin"]
  }
}
```

## 📋 Endpoints Principaux

### 🎯 Tasks - Gestion des Tâches

#### Lister les Tâches
```http
GET /api/tasks?limit=100&withPriorities=true&completed=false
```

**Paramètres de Query :**
- `limit` : Nombre max de résultats (défaut: 100)
- `withPriorities` : Inclure les scores de priorité (true/false)
- `completed` : Filtrer par statut (true/false)
- `projectId` : ID du projet/liste
- `tags` : Tags séparés par virgules
- `priority` : Niveau de priorité (1-5)
- `dateFrom` : Date début (ISO)
- `dateTo` : Date fin (ISO)

**Réponse :**
```json
{
  "success": true,
  "tasks": [
    {
      "id": "task_id",
      "title": "Développer nouvelle fonctionnalité",
      "content": "Description détaillée...",
      "dueDate": "2024-10-15T10:00:00Z",
      "priority": 3,
      "tags": ["dev", "urgent"],
      "projectId": "project_id",
      "status": 0,
      "priority_score": 0.85,
      "priority_details": {
        "complexity": 0.8,
        "urgency": 0.9,
        "duration": 0.7,
        "context": 0.6
      }
    }
  ],
  "total": 150,
  "returned": 20
}
```

#### Récupérer une Tâche
```http
GET /api/tasks/{taskId}?withPriority=true
```

#### Créer une Tâche
```http
POST /api/tasks
Content-Type: application/json

{
  "title": "Nouvelle tâche",
  "content": "Description de la tâche",
  "dueDate": "2024-10-15T14:00:00Z",
  "priority": 3,
  "tags": ["important", "business"],
  "projectId": "project_id",
  "allDay": false
}
```

#### Mettre à Jour une Tâche
```http
PUT /api/tasks/{taskId}
Content-Type: application/json

{
  "title": "Titre modifié",
  "dueDate": "2024-10-16T09:00:00Z",
  "tags": ["urgent"]
}
```

#### Supprimer une Tâche
```http
DELETE /api/tasks/{taskId}
```

#### Actions en Masse

**Mise à jour multiple :**
```http
PUT /api/tasks/bulk/update
Content-Type: application/json

{
  "taskIds": ["task1", "task2", "task3"],
  "updateData": {
    "projectId": "new_project_id",
    "tags": ["updated"]
  }
}
```

**Suppression multiple :**
```http
DELETE /api/tasks/bulk/delete
Content-Type: application/json

{
  "taskIds": ["task1", "task2", "task3"]
}
```

#### Commandes en Langage Naturel
```http
POST /api/tasks/command
Content-Type: application/json

{
  "command": "Déplacer toutes les tâches #urgent vers la liste Aujourd'hui"
}
```

**Exemples de commandes :**
- `"Prioriser les tâches de développement"`
- `"Supprimer les tâches terminées"`
- `"Planifier les tâches urgentes pour demain"`
- `"Ajouter le tag #important aux tâches client"`

#### Recherche Avancée
```http
POST /api/tasks/search
Content-Type: application/json

{
  "tags": ["urgent", "business"],
  "projectId": "project_id",
  "dateRange": {
    "start": "2024-10-01T00:00:00Z",
    "end": "2024-10-31T23:59:59Z"
  },
  "priority": 3,
  "withPriorities": true
}
```

#### Priorisation
```http
POST /api/tasks/prioritize
Content-Type: application/json

{
  "taskIds": ["task1", "task2"],
  "scope": "development"
}
```

#### Projets/Listes
```http
GET /api/tasks/projects/list
GET /api/tasks/projects/{projectId}
```

#### Statistiques
```http
GET /api/tasks/stats/overview
```

**Réponse :**
```json
{
  "success": true,
  "stats": {
    "total": 250,
    "completed": 180,
    "pending": 70,
    "withDates": 200,
    "overdue": 5,
    "today": 8,
    "thisWeek": 25,
    "tags": [
      {"tag": "urgent", "count": 15},
      {"tag": "business", "count": 45}
    ],
    "priorities": {
      "none": 50,
      "low": 80,
      "medium": 90,
      "high": 30
    }
  }
}
```

### 📅 Calendar - Synchronisation Calendrier

#### Lister les Calendriers
```http
GET /api/calendar/list
```

#### Événements d'un Calendrier
```http
GET /api/calendar/{calendarId}/events?timeMin=2024-10-01&timeMax=2024-10-31&maxResults=50
```

#### Créer un Événement
```http
POST /api/calendar/{calendarId}/events?checkConflicts=true
Content-Type: application/json

{
  "summary": "Réunion importante",
  "description": "Discussion sur le projet",
  "start": {
    "dateTime": "2024-10-15T14:00:00Z",
    "timeZone": "Europe/Paris"
  },
  "end": {
    "dateTime": "2024-10-15T15:00:00Z",
    "timeZone": "Europe/Paris"
  },
  "reminders": {
    "useDefault": false,
    "overrides": []
  }
}
```

#### Mettre à Jour un Événement
```http
PUT /api/calendar/{calendarId}/events/{eventId}
```

#### Supprimer un Événement
```http
DELETE /api/calendar/{calendarId}/events/{eventId}
```

#### Statut de Synchronisation
```http
GET /api/calendar/sync/status
```

**Réponse :**
```json
{
  "success": true,
  "stats": {
    "lastSyncTime": "2024-10-01T10:30:00Z",
    "totalMappings": 45,
    "memoryUsage": {
      "rss": 123456789,
      "heapUsed": 87654321,
      "heapTotal": 123456789
    }
  },
  "mappings": 45
}
```

#### Synchronisation Complète
```http
POST /api/calendar/sync/full
```

#### Synchroniser une Tâche Spécifique
```http
POST /api/calendar/sync/task/{taskId}
Content-Type: application/json

{
  "calendarId": "jeremy.polizzie@gmail.com",
  "options": {
    "checkConflicts": true,
    "color": "1",
    "reminders": false
  }
}
```

#### Créneaux Disponibles
```http
GET /api/calendar/availability?date=2024-10-15&duration=60&calendars=cal1,cal2
```

**Réponse :**
```json
{
  "success": true,
  "date": "Tue Oct 15 2024",
  "duration": 60,
  "calendars": ["jeremy.polizzie@gmail.com", "plusdeclients@gmail.com"],
  "slots": [
    {
      "start": "2024-10-15T09:00:00Z",
      "end": "2024-10-15T10:00:00Z",
      "duration": 60
    },
    {
      "start": "2024-10-15T14:00:00Z",
      "end": "2024-10-15T16:00:00Z",
      "duration": 120
    }
  ],
  "total": 2
}
```

#### Détection des Conflits
```http
POST /api/calendar/conflicts/detect
Content-Type: application/json

{
  "event": {
    "summary": "Nouvel événement",
    "start": {"dateTime": "2024-10-15T14:00:00Z"},
    "end": {"dateTime": "2024-10-15T15:00:00Z"}
  },
  "calendars": ["jeremy.polizzie@gmail.com"]
}
```

#### Résolution Automatique des Conflits
```http
POST /api/calendar/conflicts/resolve
```

#### Nettoyage des Orphelins
```http
POST /api/calendar/cleanup/orphans
```

#### Statistiques Calendrier
```http
GET /api/calendar/stats
```

#### Santé Synchronisation
```http
GET /api/calendar/health
```

### ⏰ Scheduler - Planificateur Intelligent

#### Statut du Scheduler
```http
GET /api/scheduler/status
```

**Réponse :**
```json
{
  "success": true,
  "status": {
    "isRunning": false,
    "scheduledJobs": ["daily", "sync", "health"],
    "lastRun": "2024-10-01T06:00:00Z",
    "nextRun": "2024-10-02T06:00:00Z",
    "timezone": "Europe/Paris"
  }
}
```

#### Contrôles du Scheduler

**Démarrer :**
```http
POST /api/scheduler/start
```

**Arrêter :**
```http
POST /api/scheduler/stop
```

**Exécution manuelle :**
```http
POST /api/scheduler/run
```

#### Synchronisation Manuelle
```http
POST /api/scheduler/sync
```

#### Rapport Quotidien
```http
GET /api/scheduler/report/daily
```

**Réponse :**
```json
{
  "success": true,
  "report": {
    "timestamp": "2024-10-01T10:00:00Z",
    "summary": {
      "totalTasks": 150,
      "completedToday": 8,
      "pendingTasks": 142,
      "tasksWithDates": 120
    },
    "details": {
      "systemHealth": {
        "ticktick": true,
        "google": true,
        "overall": true
      },
      "syncStats": {
        "lastSyncTime": "2024-10-01T09:30:00Z",
        "totalMappings": 45
      },
      "productivity": {
        "averageCompletionTime": "14:30",
        "mostProductiveTags": [
          {"tag": "dev", "count": 3},
          {"tag": "urgent", "count": 2}
        ]
      }
    },
    "recommendations": [
      "Considérer la suppression des tâches anciennes",
      "Planification optimale détectée"
    ]
  }
}
```

#### Historique des Exécutions
```http
GET /api/scheduler/history?limit=10
```

#### Analyse de Charge de Travail
```http
GET /api/scheduler/analysis/workload?days=7
```

#### Suggestions d'Optimisation
```http
GET /api/scheduler/suggestions
```

#### Planification Avancée
```http
POST /api/scheduler/plan
Content-Type: application/json

{
  "days": 7,
  "mode": "intelligent"
}
```

#### Réorganisation
```http
POST /api/scheduler/reorganize
```

#### Configuration

**Récupérer :**
```http
GET /api/scheduler/config
```

**Mettre à jour les priorités :**
```http
POST /api/scheduler/config/priorities
Content-Type: application/json

{
  "weights": {
    "complexityWeight": 0.4,
    "urgencyWeight": 0.3,
    "durationWeight": 0.2,
    "contextWeight": 0.1
  }
}
```

#### Santé du Système
```http
GET /api/scheduler/health
```

### 🔧 API - Informations Système

#### Informations Générales
```http
GET /api/
GET /api/info
```

#### Statistiques Système
```http
GET /api/stats
```

#### Santé Globale
```http
GET /api/health
```

#### Configuration Publique
```http
GET /api/config
```

#### Version
```http
GET /api/version
```

#### Ping/Performance
```http
GET /api/ping
```

### 🔐 Auth - Authentification

#### Statut Global
```http
GET /auth/status
```

#### TickTick

**Démarrer l'auth :**
```http
GET /auth/ticktick/start
```

**Statut :**
```http
GET /auth/ticktick/status
```

**Réinitialiser :**
```http
POST /auth/ticktick/reset
```

#### Google Calendar

**Démarrer l'auth :**
```http
GET /auth/google/start
```

**Statut :**
```http
GET /auth/google/status
```

**Réinitialiser :**
```http
POST /auth/google/reset
```

## 📊 Codes de Réponse HTTP

| Code | Signification | Description |
|------|--------------|-------------|
| 200 | OK | Requête réussie |
| 201 | Created | Ressource créée |
| 400 | Bad Request | Paramètres invalides |
| 401 | Unauthorized | Token manquant/invalide |
| 403 | Forbidden | Permissions insuffisantes |
| 404 | Not Found | Ressource non trouvée |
| 409 | Conflict | Conflit détecté |
| 429 | Too Many Requests | Rate limit dépassé |
| 500 | Internal Server Error | Erreur serveur |
| 503 | Service Unavailable | Service temporairement indisponible |

## 🔄 Format des Réponses

### Succès
```json
{
  "success": true,
  "data": {...},
  "message": "Opération réussie",
  "timestamp": "2024-10-01T10:00:00Z"
}
```

### Erreur
```json
{
  "error": "Description de l'erreur",
  "code": "ERROR_CODE",
  "details": "Détails supplémentaires",
  "timestamp": "2024-10-01T10:00:00Z",
  "path": "/api/endpoint"
}
```

## 🚦 Rate Limiting

- **Fenêtre :** 15 minutes
- **Limite :** 100 requêtes par IP
- **Headers de réponse :**
  - `X-RateLimit-Limit`: Limite maximale
  - `X-RateLimit-Remaining`: Requêtes restantes
  - `X-RateLimit-Reset`: Timestamp de reset

## 🔍 Filtrage et Pagination

### Filtres Communs
```
?limit=50           # Limite de résultats
?offset=100         # Décalage
?sort=createdAt     # Tri
?order=desc         # Ordre (asc/desc)
?search=keyword     # Recherche textuelle
```

### Dates
```
?dateFrom=2024-10-01T00:00:00Z
?dateTo=2024-10-31T23:59:59Z
```

## 🧪 Exemples d'Utilisation

### Workflow Complet
```bash
# 1. Authentification
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"admin123"}' | jq -r '.token')

# 2. Lister les tâches avec priorités
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/tasks?withPriorities=true&limit=5"

# 3. Exécuter une commande naturelle
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command": "Prioriser les tâches urgentes"}' \
  http://localhost:3000/api/tasks/command

# 4. Synchroniser le calendrier
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/calendar/sync/full

# 5. Lancer l'organisation quotidienne
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/scheduler/run
```

### Intégration JavaScript
```javascript
class TickTickOrchestrator {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async apiCall(endpoint, method = 'GET', data = null) {
    const config = {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    };

    if (data && method !== 'GET') {
      config.body = JSON.stringify(data);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, config);
    return await response.json();
  }

  async getTasks(filters = {}) {
    const params = new URLSearchParams(filters);
    return await this.apiCall(`/api/tasks?${params}`);
  }

  async executeCommand(command) {
    return await this.apiCall('/api/tasks/command', 'POST', { command });
  }

  async syncCalendar() {
    return await this.apiCall('/api/calendar/sync/full', 'POST');
  }
}

// Usage
const orchestrator = new TickTickOrchestrator('http://localhost:3000', 'your-token');
const tasks = await orchestrator.getTasks({ withPriorities: true });
```

## 🛡️ Sécurité

### Headers Recommandés
```http
Authorization: Bearer <token>
Content-Type: application/json
X-Requested-With: XMLHttpRequest
```

### Protection CORS
```javascript
// Domains autorisés en production
Access-Control-Allow-Origin: https://your-domain.com
```

### Token JWT
- **Expiration :** 24 heures
- **Refresh :** Automatique côté client
- **Stockage :** LocalStorage (sécurisé)

---

Cette documentation couvre l'ensemble des endpoints disponibles. Pour des exemples plus détaillés, consultez le [Guide d'Utilisation](USAGE.md).
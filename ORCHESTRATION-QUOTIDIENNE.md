# 🎯 Système d'Orchestration Quotidienne Unifié

## Vue d'ensemble

Le système d'orchestration quotidienne est maintenant **unifié** : le même workflow s'exécute automatiquement chaque jour via cron ET peut être déclenché manuellement via le bouton du dashboard.

## Architecture

```
┌─────────────────────────────────────────────┐
│  🎯 DailyOrchestrator                       │
│  (src/orchestrator/daily-orchestrator.js)   │
└─────────────────────────────────────────────┘
         │
         ├──> 📥 Étape 1: Nettoyage Inbox
         │    ├─ Classification LLM (GROQ/Gemini)
         │    ├─ Détection projet automatique
         │    ├─ Estimation durée (15min-8h)
         │    ├─ Priorité intelligente
         │    ├─ Deadline optimale (demain → 60j)
         │    └─ Batch 10 tâches à la fois
         │
         └──> 🔄 Étape 2: Rééquilibrage 60 jours
              ├─ Détection conflits/surcharges
              ├─ Max 2-3 tâches/jour
              ├─ Tâches courtes (≤1h) → Week-end
              ├─ Tâches longues (>2h) → Semaine
              ├─ Planification à partir de DEMAIN
              └─ Réorganisation complète si reportées
```

## Déclencheurs

### 1. Automatique (Cron)

**Quand**: Chaque jour à 8h du matin

**Script**: `scripts/daily-inbox-cleanup.js`

**Configuration cron**:
```bash
0 8 * * * cd /root/Ticktick-Orchestrator && node scripts/daily-inbox-cleanup.js >> /var/log/cron-orchestration.log 2>&1
```

**Comportement**:
- Initialise le DailyOrchestrator
- Exécute `performDailyOrchestration()`
- Exit code 0 = succès, 1 = échec (pour monitoring cron)

### 2. Manuel (Dashboard)

**Où**: Bouton "Ajustement Auto" dans le dashboard

**Endpoint**: `POST /api/scheduler/daily-orchestration`

**Fichier frontend**: `src/web/public/app.js` → fonction `continuousAdjust()`

**Comportement**:
- Appelle l'endpoint `/daily-orchestration`
- Affiche notification de lancement
- Refresh automatique toutes les 3s pendant 60s
- Suivi temps réel via ActivityTracker

## Workflow détaillé

### Étape 1: Nettoyage Inbox (IntelligentAgent)

**Durée estimée**: 30-90 secondes (selon nombre de tâches)

**Processus**:

1. **Récupération tâches Inbox**
   - Endpoint: `/open/v1/project/inbox127524840/data`
   - Seules les tâches sans projet (status=0)

2. **Classification par lots (batch de 10)**
   - Évite timeout LLM
   - GROQ en premier (Llama 3.3 70B)
   - Gemini en fallback si rate limit

3. **Analyse LLM pour chaque tâche**
   ```json
   {
     "projectName": "Détecté automatiquement",
     "estimatedDuration": "30min | 1h | 2h | 4h | 8h",
     "priority": 0-5,
     "deadline": "YYYY-MM-DD (demain minimum)",
     "tags": ["tag1", "tag2"]
   }
   ```

4. **Application modifications**
   - Déplace vers projet approprié
   - Définit durée estimée
   - Applique priorité
   - Définit deadline intelligente
   - Ajoute tags contextuels

**Règles strictes**:
- ⚠️ **CRITIQUE**: Planification à partir de DEMAIN (jamais aujourd'hui)
- Max 2-3 tâches/jour
- Tâches courtes (≤1h) → Week-end préféré
- Tâches longues (>2h) → Semaine
- Répartition équilibrée sur 60 jours

### Étape 2: Rééquilibrage 60 jours (IntelligentScheduler)

**Durée estimée**: 10-30 secondes

**Processus**:

1. **Analyse complète planning**
   - Toutes les tâches avec deadline sur 60 jours
   - Détection surcharges (>3 tâches/jour)
   - Détection conflits temporels

2. **Optimisation intelligente**
   - Déplace tâches des jours surchargés
   - Privilégie jours sous-chargés
   - Respecte contraintes week-end/semaine
   - Maintient ordre priorité

3. **Réorganisation si reportées**
   - Si tâches manquées (deadline passée)
   - Redistribue sur horizon 60 jours
   - Préserve charge légère (2-3/jour)

## Fichiers du système

### Core

- **`src/orchestrator/daily-orchestrator.js`** (225 lignes)
  - Classe principale d'orchestration
  - `performDailyOrchestration()`: workflow complet
  - Reporting détaillé avec stats

### API

- **`src/web/routes/scheduler.js`**
  - Endpoint: `POST /daily-orchestration` (lignes 258-315)
  - Exécution asynchrone
  - Tracking temps réel

### Frontend

- **`src/web/public/app.js`**
  - Fonction `continuousAdjust()` (lignes 1105-1133)
  - Appelle endpoint unifié
  - Refresh automatique

- **`src/web/public/index.html`**
  - Bouton "Ajustement Auto"
  - Tooltip informatif

### Cron

- **`scripts/daily-inbox-cleanup.js`**
  - Script d'exécution quotidienne
  - Utilise DailyOrchestrator
  - Exit codes pour monitoring

## Logs et monitoring

### Logs détaillés

Pendant l'exécution, le système log:

```
🎯 ═══════════════════════════════════════════════════════
🎯 DÉMARRAGE ORCHESTRATION QUOTIDIENNE COMPLÈTE
🎯 ═══════════════════════════════════════════════════════

📥 ÉTAPE 1/2: Nettoyage Inbox avec LLM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Inbox nettoyé: 15/20 tâches classées (45000ms)

🔄 ÉTAPE 2/2: Rééquilibrage intelligent sur 60 jours
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Règles:
  • Max 2-3 tâches/jour
  • Tâches courtes (≤1h) → Week-end
  • Tâches longues (>2h) → Semaine
  • Planification à partir de DEMAIN
  • Réorganisation complète si tâches reportées

✅ Rééquilibrage terminé: 12 tâches replanifiées (18000ms)
   Conflits détectés: 3
   Tâches analysées: 85

🎯 ═══════════════════════════════════════════════════════
🎯 ORCHESTRATION QUOTIDIENNE TERMINÉE
🎯 ═══════════════════════════════════════════════════════

📊 RÉSUMÉ:

  📥 Inbox:
     • 15/20 tâches classées
     • 0 échecs
     • Durée: 45s

  🔄 Rééquilibrage:
     • 12 tâches replanifiées
     • 3 conflits résolus
     • 85 tâches analysées
     • Durée: 18s

  ⏱️  Durée totale: 63s
  📈 Statut: ✅ SUCCÈS

🎉 Orchestration quotidienne réussie!
```

### Rapport JSON

Le système retourne un rapport structuré:

```json
{
  "success": true,
  "startTime": "2025-10-16T08:00:00.000Z",
  "totalDuration": 63000,
  "steps": [
    {
      "name": "inbox_cleanup",
      "success": true,
      "tasksTotal": 20,
      "tasksMoved": 15,
      "tasksFailed": 0,
      "duration": 45000
    },
    {
      "name": "continuous_adjust",
      "success": true,
      "tasksAnalyzed": 85,
      "tasksRescheduled": 12,
      "conflictsDetected": 3,
      "duration": 18000
    }
  ]
}
```

## Suivi temps réel (ActivityTracker)

Lors de l'exécution depuis le dashboard, l'ActivityTracker permet de voir la progression en temps réel:

```
🎯 Orchestration Quotidienne Complète
  ├─ 📥 Étape 1/2: Nettoyage Inbox avec LLM
  │   └─ En cours... (15/20 tâches traitées)
  └─ 🔄 Étape 2/2: Rééquilibrage 60 jours
      └─ En attente...
```

## Règles de planification

### Règles strictes (CRITIQUES)

1. **⚠️ Planification à partir de DEMAIN**
   - Jamais de tâches pour aujourd'hui
   - Toujours demain minimum

2. **Max 2-3 tâches/jour**
   - Charge légère garantie
   - Évite surcharge

3. **Optimisation week-end/semaine**
   - Tâches courtes ≤1h → Week-end préféré
   - Tâches longues >2h → Semaine

4. **Répartition 60 jours**
   - Distribution équilibrée
   - Visibilité long terme

5. **Rééquilibrage automatique**
   - Si tâches reportées
   - Réorganisation complète
   - Maintien charge légère

### Estimation durée automatique

Le LLM estime la durée selon ces critères:

- **15min**: Emails, appels rapides, reviews
- **30min**: Meetings, tâches simples
- **1h**: Tâches standard
- **2h**: Développement, rédaction
- **4h**: Projets moyens
- **8h**: Projets majeurs

### Priorisation automatique

- **Priority 5 (High)**: Urgences, deadlines cette semaine
- **Priority 3 (Medium)**: Importantes, deadlines 7-30j
- **Priority 1 (Low)**: Normales, deadlines 30-60j
- **Priority 0 (None)**: Nice-to-have, pas de deadline

## Tests

### Test manuel depuis dashboard

1. Ouvrir dashboard: http://localhost:3000
2. Cliquer sur "Ajustement Auto"
3. Observer progression temps réel
4. Vérifier logs dans terminal serveur

### Test script cron

```bash
cd /root/Ticktick-Orchestrator
node scripts/daily-inbox-cleanup.js
```

**Output attendu**:
- Logs détaillés dans terminal
- Exit code 0 si succès
- Exit code 1 si échec

### Vérification cron configuré

```bash
crontab -l | grep daily-inbox-cleanup
```

**Sortie attendue**:
```
0 8 * * * cd /root/Ticktick-Orchestrator && node scripts/daily-inbox-cleanup.js >> /var/log/cron-orchestration.log 2>&1
```

## Dépannage

### Problème: Inbox pas vidé

**Cause possible**: Rate limit TickTick API atteint

**Solution**:
- Le système traite au minimum 10 tâches/jour (batch 1 avec GROQ)
- Les batches suivants peuvent échouer si rate limit
- Re-exécuter le lendemain pour traiter les restantes

### Problème: Tâches planifiées aujourd'hui

**Cause**: Bug LLM qui ignore la règle "à partir de demain"

**Solution**:
- Vérifier prompt dans `src/llm/intelligent-agent.js:816-823`
- Doit contenir: "⚠️ RÈGLE CRITIQUE: TOUTES les tâches doivent être planifiées À PARTIR DE DEMAIN minimum"

### Problème: Surcharge (>3 tâches/jour)

**Cause**: Rééquilibrage insuffisant ou trop de tâches urgentes

**Solution**:
- Étape 2 devrait redistribuer automatiquement
- Vérifier logs: "Rééquilibrage terminé: X tâches replanifiées"
- Si problème persiste, augmenter horizon (60 → 90 jours)

## Évolutions futures

### Améliorations potentielles

1. **Batch adaptatif**
   - Ajuster taille batch selon rate limit
   - 10 → 5 → 2 si trop de rate limit

2. **Parser JSON robuste**
   - Gérer réponses Gemini non-JSON
   - Extraction regex en fallback

3. **Notifications**
   - Email quotidien avec résumé
   - Alertes si échec critique

4. **Dashboard stats**
   - Graphiques progression Inbox
   - Historique orchestrations
   - Taux succès/échec

5. **Retry intelligent**
   - Re-essayer tâches échouées
   - Backoff exponentiel

---

**Statut**: ✅ Système opérationnel et testé

**Dernière mise à jour**: 16 octobre 2025

**Version**: 1.0.0

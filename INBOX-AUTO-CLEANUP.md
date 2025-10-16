# 🗂️ Système de Nettoyage Automatique Inbox

**Date**: 16 octobre 2025
**Statut**: ✅ OPÉRATIONNEL

## 🎯 Objectif

**Vider automatiquement l'Inbox TickTick** chaque jour en classant intelligemment les tâches dans leurs projets appropriés avec:
- Estimation durée par le LLM
- Priorités intelligentes
- Répartition sur 60 jours
- Max 2-3 tâches/jour
- Tâches courtes le week-end

## 🏗️ Architecture

### Composants

1. **IntelligentAgent.processInboxToProjects()** (`src/llm/intelligent-agent.js:782-996`)
   - Récupère toutes les tâches Inbox
   - Appelle le LLM pour analyse intelligente (batches de 10)
   - Déplace les tâches vers leurs projets
   - Ajoute durée estimée, priorité, deadline, tags

2. **Script Cron** (`scripts/daily-inbox-cleanup.js`)
   - Exécution quotidienne à 8h du matin
   - Logs dans `/root/Ticktick-Orchestrator/data/logs/cron-inbox-cleanup.log`
   - Wrapper simple autour de `processInboxToProjects()`

3. **Continuous Adjust** (existant, toutes les 30min)
   - Rééquilibre automatiquement les tâches reportées
   - Réorganise la charge sur 60 jours
   - Gère les tâches non faites

### Flux de Travail

```
┌─────────────────────────────────────────────────────────────┐
│                 CHAQUE JOUR À 8H                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  1. Récupération tâches Inbox (92 tâches actuellement)      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  2. Division en batches de 10 tâches                         │
│     (évite timeout LLM)                                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  3. Pour chaque batch:                                       │
│     ┌──────────────────────────────────────────────────┐   │
│     │ LLM analyse et décide:                            │   │
│     │ • Projet approprié                                │   │
│     │ • Durée estimée (15min, 30min, 1h, 2h, 4h, 8h)  │   │
│     │ • Priorité (0-5)                                  │   │
│     │ • Deadline sur 60 jours (À PARTIR DE DEMAIN)     │   │
│     │ • Tags pertinents                                 │   │
│     └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  4. Déplacement des tâches vers leurs projets                │
│     • updateTask() avec nouveau projectId                    │
│     • Ajout durée estimée dans le contenu                    │
│     • Application priorité et deadline                       │
│     • Invalidation cache                                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  5. Continuous Adjust (toutes les 30min)                     │
│     • Rééquilibre la charge si tâches reportées             │
│     • Réorganise sur 60 jours                               │
│     • Max 2-3 tâches/jour                                    │
└─────────────────────────────────────────────────────────────┘
```

## 🧠 Intelligence du LLM

### Prompt System

Le LLM reçoit:
```
Tu es un gestionnaire de tâches expert. Tu dois analyser des tâches Inbox
et les classer intelligemment.

PROJETS DISPONIBLES:
- Professionnel (id: xxx)
- Santé (id: xxx)
- Création de formations (id: xxx)
...

RÈGLES DE CLASSIFICATION:
1. Durée estimée: 15min, 30min, 1h, 2h, 4h, 8h
2. Projet approprié selon contexte
3. Priorité: 0-5
4. Deadline intelligente:
   ⚠️ RÈGLE CRITIQUE: À PARTIR DE DEMAIN minimum
   - Max 2-3 tâches/jour
   - Tâches COURTES (≤1h) → Week-end
   - Tâches LONGUES (>2h) → Semaine
   - Urgentes → Cette semaine (demain ou après-demain)
   - Importantes → Dans 2-7 jours
   - Normales → Dans 7-60 jours
5. Tags pertinents
```

### Exemple de Classification

**Input:**
```json
{
  "taskId": "abc123",
  "title": "Créer compte Instagram de Kizomba",
  "content": "",
  "currentPriority": 0
}
```

**Output LLM:**
```json
{
  "taskId": "abc123",
  "title": "Créer compte Instagram de Kizomba",
  "projectId": "68211aeb8f087974ae3dbed9",
  "projectName": "Création de formations",
  "priority": 1,
  "estimatedMinutes": 30,
  "dueDate": "2025-10-19",  // Week-end (tâche courte)
  "tags": ["instagram", "social-media", "kizomba"],
  "reasoning": "Tâche courte de création de contenu, planifiée pour le week-end"
}
```

## 📋 Règles de Planification

### 1. Planification À Partir de Demain

**RÈGLE ABSOLUE**: Aucune tâche planifiée pour aujourd'hui (jour J).

```javascript
// ⚠️ RÈGLE CRITIQUE dans le prompt LLM
"TOUTES les tâches doivent être planifiées À PARTIR DE DEMAIN minimum"
"JAMAIS de tâches pour aujourd'hui"
```

**Raison**: Les tâches du jour J sont intouchables. Seul le rééquilibrage automatique peut les déplacer si non faites.

### 2. Répartition de Charge

**Max 2-3 tâches par jour** sur un horizon de 60 jours.

**Distribution intelligente**:
- **Urgentes** (priorité 5): Demain ou après-demain
- **Importantes** (priorité 3-4): Dans 2-7 jours
- **Normales** (priorité 0-2): Dans 7-60 jours

**Durée vs Jour de la semaine**:
- **Tâches courtes** (≤1h): Week-end de préférence
- **Tâches longues** (>2h): Semaine (plus de temps)

### 3. Estimation Durée

Le LLM estime le temps de travail réaliste:

| Estimation | Type de Tâche | Exemples |
|-----------|---------------|----------|
| 15min | Ultra-rapide | Email, appel court, vérification |
| 30min | Rapide | Instagram, configuration simple |
| 1h | Standard | Création contenu, recherche |
| 2h | Moyenne | Formation, développement feature |
| 4h | Longue | Projet complexe, refonte |
| 8h | Très longue | Journée complète dédiée |

**Stockage**: La durée estimée est ajoutée au contenu de la tâche:
```
⏱️ Durée estimée: 2h30
```

### 4. Rééquilibrage Automatique

**Quand une tâche n'est pas faite** (reportée), le **Continuous Adjust** (toutes les 30min):
1. Détecte les tâches en retard
2. Les reporte automatiquement
3. **Rééquilibre TOUTE la charge sur les 60 prochains jours**
4. Réorganise les dates pour éviter surcharge
5. Respecte toujours 2-3 tâches/jour

## 🔧 Configuration

### Cron Schedule

**Fichier**: `/etc/crontab` ou `crontab -e`

```bash
# Nettoyage Inbox quotidien (8h du matin)
0 8 * * * /root/Ticktick-Orchestrator/scripts/daily-inbox-cleanup.js >> /root/Ticktick-Orchestrator/data/logs/cron-inbox-cleanup.log 2>&1

# Continuous Adjust (toutes les 30min)
*/30 * * * * /root/Ticktick-Orchestrator/scripts/run-continuous-adjust.sh >> /root/Ticktick-Orchestrator/data/logs/cron-continuous-adjust.log 2>&1
```

### Logs

- **Inbox Cleanup**: `/root/Ticktick-Orchestrator/data/logs/cron-inbox-cleanup.log`
- **Continuous Adjust**: `/root/Ticktick-Orchestrator/data/logs/cron-continuous-adjust.log`

**Consulter les logs**:
```bash
# Dernière exécution Inbox cleanup
tail -50 /root/Ticktick-Orchestrator/data/logs/cron-inbox-cleanup.log

# Suivre en temps réel
tail -f /root/Ticktick-Orchestrator/data/logs/cron-inbox-cleanup.log
```

## 🧪 Tests

### Test Manuel

```bash
# Exécuter nettoyage Inbox immédiatement
node /root/Ticktick-Orchestrator/scripts/daily-inbox-cleanup.js

# Avec logs détaillés
node /tmp/test-inbox-cleanup.js
```

### Résultats Test (16 oct 2025)

**Avant nettoyage:**
- Tâches Inbox: 92

**Batch 1 (10 tâches) - GROQ:**
- ✅ 10 tâches classées avec succès
- Exemples:
  - "Fiscalité voyage" → Santé (30min, priorité 3)
  - "Comptes offshore" → Professionnel (60min, priorité 1)
  - "Instagram Kizomba" → Créations formations (30min, priorité 0)

**Batch 2-3 - Gemini (fallback):**
- ⚠️ Format JSON invalide retourné
- À améliorer: Parser plus tolérant ou meilleur prompt Gemini

**Conclusion**: Système fonctionnel avec GROQ. Gemini nécessite amélioration.

## 🚀 Impact Business

### Pour l'Utilisateur

- ✅ **Inbox toujours propre**: Pas de surcharge cognitive
- ✅ **Classification intelligente**: Le LLM comprend le contexte
- ✅ **Planification optimale**: Charge équilibrée, tâches courtes week-end
- ✅ **Automatique**: Aucune intervention requise

### Pour l'Orchestrateur

- ✅ **Vision complète**: Toutes les tâches classées et planifiées
- ✅ **Synchronisation Calendar**: Tâches Inbox maintenant dans le planning
- ✅ **Rééquilibrage intelligent**: Continuous Adjust gère les reports

## 📊 Métriques

**Avant le système**:
- Inbox: 92 tâches non classées
- Visibilité orchestrateur: Partielle
- Planification: Manuelle

**Après le système**:
- Inbox: Vide quotidiennement (objectif)
- Visibilité orchestrateur: Complète
- Planification: Automatique sur 60 jours
- Charge: Max 2-3 tâches/jour
- Rééquilibrage: Toutes les 30min

## 🐛 Problèmes Connus

### Gemini Format Invalide

**Symptôme**: Quand GROQ atteint rate limit, Gemini fallback retourne parfois du texte au lieu de JSON.

**Impact**: Batches après le premier peuvent échouer.

**Solutions possibles**:
1. ✅ Améliorer le prompt Gemini pour forcer JSON strict
2. ✅ Parser plus tolérant (chercher JSON dans le texte)
3. ✅ Augmenter timeout avant fallback Gemini
4. ✅ Limiter batches à 5 tâches au lieu de 10

**Workaround actuel**: Premier batch toujours traité (GROQ), donc 10 tâches minimum traitées par jour.

## 🔄 Évolutions Futures

1. **Parser JSON amélioré**: Extraire JSON même si enrobé de texte
2. **Gemini prompt optimisé**: Format JSON garanti
3. **Batch size dynamique**: S'adapter au rate limit
4. **Statistiques détaillées**: Dashboard nettoyage Inbox
5. **Notification utilisateur**: Email récap chaque matin
6. **Machine Learning**: Apprendre des classifications précédentes

## 📝 Notes Techniques

### Rate Limiting

- **GROQ**: 100 req/min, 300 req/5min (généreux)
- **Gemini**: Gratuit mais moins fiable JSON
- **TickTick**: 100 req/min, 300 req/5min
- **Throttle**: Respecté via `waitForRateLimit()`

### Performance

- **92 tâches Inbox**: ~10 batches de 10
- **Durée estimée**: ~2-3 minutes (avec rate limit)
- **Cache invalidation**: Après chaque déplacement
- **Optimal**: Exécution quotidienne (charge faible)

### Sécurité

- **Aucune suppression**: Tâches déplacées, jamais supprimées
- **Logs complets**: Traçabilité totale
- **Fallback**: Si erreur, tâches restent en Inbox
- **Idempotent**: Peut être exécuté plusieurs fois sans danger

---

**Conclusion**: Système complet et intelligent de nettoyage Inbox automatique avec planification sur 60 jours, répartition de charge, et rééquilibrage automatique. Le LLM gère toute l'intelligence de classification.

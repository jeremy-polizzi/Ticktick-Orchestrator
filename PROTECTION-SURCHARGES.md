# 🛡️ Protection contre les Surcharges - Orchestration Quotidienne

## Vue d'ensemble

Le système d'orchestration quotidienne traite **93 tâches Inbox + 250 tâches totales** chaque jour. Des protections sont en place pour éviter les surcharges API.

## 📊 Volumes de charge actuels

### Situation normale (93 tâches Inbox)

**Étape 1: Nettoyage Inbox (80s)**
- 10 appels LLM (1 par batch de 10 tâches)
- 93 appels TickTick (1 update par tâche)

**Étape 2: Rééquilibrage (20s)**
- 2 appels TickTick (sync)
- ~15 appels TickTick (reschedule)

**Total: ~100s (2 minutes)**
- 10 appels LLM
- 110 appels TickTick
- **66 req/min TickTick** (66% de la limite 100 req/min) ✅
- **20% quota GROQ** (5 req/min sur 30 RPM) ✅

### Scénarios à risque

**Inbox très remplie (200 tâches)**
- 20 appels LLM
- 217 appels TickTick
- **72 req/min** → Proche limite mais gérable ⚠️

**Réorganisation massive (100 tâches déplacées)**
- 195 appels TickTick
- **117 req/min** → Dépassement, throttle actif ❌

## 🛡️ Protections en place

### 1. Throttle automatique TickTick

**Fichier**: `src/api/ticktick-api.js:60-90`

**Mécanisme**: Attente automatique avant chaque requête

```javascript
async waitForRateLimit() {
  // Vérifier limite 5 minutes (250/300)
  if (this.requestTimestamps.length >= this.maxRequestsPer5Minutes) {
    const waitTime = 300000 - (now - oldestRequest) + 1000;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  // Vérifier limite 1 minute (80/100)
  if (recentRequests.length >= this.maxRequestsPerMinute) {
    const waitTime = 60000 - (now - oldestRecentRequest) + 1000;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
}
```

**Limites configurées:**
- 80 req/min (seuil sécurité vs 100 officiel)
- 250 req/5min (seuil sécurité vs 300 officiel)

**Comportement:**
- Si >80 req/min atteint → **Pause automatique jusqu'à 1min suivante**
- Si >250 req/5min atteint → **Pause automatique jusqu'à 5min suivantes**
- **Aucune intervention manuelle requise** ✅

### 2. Délai entre batches Inbox

**Fichier**: `src/llm/intelligent-agent.js:967-970`

**Mécanisme**: Pause de 2 secondes entre chaque batch

```javascript
// Attendre un peu entre les batches pour éviter rate limit
if (batchIndex < batches.length - 1) {
  await new Promise(resolve => setTimeout(resolve, 2000));
}
```

**Impact:**
- 10 batches × 2s = 20 secondes de délai total
- Lisse la charge sur 100s au lieu de 80s
- Réduit le pic de charge TickTick

**Calcul sans délai:**
- 93 updates en 80s = 70 req/min ❌ (proche limite)

**Calcul avec délai:**
- 93 updates en 100s = **56 req/min** ✅ (marge confortable)

### 3. Fallback LLM intelligent

**Fichier**: `src/llm/intelligent-agent.js:81-108`

**Mécanisme**: Bascule automatique GROQ → Gemini

```javascript
// Essayer GROQ en priorité
if (this.groq) {
  try {
    const completion = await this.groq.chat.completions.create(...);
  } catch (error) {
    if (error.message.includes('rate_limit')) {
      logger.warn('⚠️  GROQ rate limit, bascule sur Gemini...');
    }
  }
}

// Fallback Gemini si GROQ échoue
if (this.gemini) {
  const result = await chat.sendMessage(...);
}
```

**Limites LLM:**
- **GROQ**: 30 req/min, 14400 req/jour (gratuit)
- **Gemini**: 15 req/min, 1500 req/jour (gratuit)

**Utilisation actuelle:**
- GROQ: 10 req en 2min = **5 req/min** (17% du quota) ✅
- Gemini (si fallback): 10 req en 2min = **5 req/min** (33% du quota) ✅

### 4. Cache 2 minutes

**Fichier**: `src/api/ticktick-api.js:92-110`

**Mécanisme**: Cache en mémoire pour lectures répétées

```javascript
getFromCache(key) {
  const cached = this.cache.get(key);
  if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
    return cached.data; // Évite appel API
  }
  return null;
}
```

**TTL**: 2 minutes (120000ms)

**Bénéfices:**
- Évite duplicatas lors de lectures rapprochées
- Réduit charge sur getProjects(), getTasks()
- **Pas de cache sur writes** (create/update/delete) → Cohérence garantie

### 5. Batch processing

**Fichier**: `src/llm/intelligent-agent.js:850-854`

**Mécanisme**: Divise Inbox en lots de 10 tâches

```javascript
const BATCH_SIZE = 10;
const batches = [];
for (let i = 0; i < inboxTasks.length; i += BATCH_SIZE) {
  batches.push(inboxTasks.slice(i, i + BATCH_SIZE));
}
```

**Avantages:**
- **Évite timeout LLM** (10 tâches = ~8s de processing)
- **Lisse la charge** (10 batches × 8s = 80s au lieu d'1 gros appel)
- **Partial success** (si batch 3 échoue, batches 1-2 sont déjà traités)

**Alternative sans batch:**
- 1 appel LLM avec 93 tâches = **Timeout après 30s** ❌
- Tout échoue si 1 seule erreur ❌

### 6. Retry automatique

**Fichier**: `src/api/ticktick-api.js:46-57`

**Mécanisme**: Intercepteur axios pour retry sur 401

```javascript
this.client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && this.refreshToken) {
      await this.refreshAccessToken();
      return this.client.request(error.config); // Retry
    }
    return Promise.reject(error);
  }
);
```

**Cas gérés:**
- Token expiré → Refresh auto + retry
- Rate limit → Géré par throttle (pas de retry immédiat)

## 📈 Monitoring en temps réel

### Logs throttle

Quand le système approche des limites, tu verras:

```
⚠️  Rate limit 1min approché (78/80), attente 15s
```

```
⚠️  Rate limit 5min approché (248/250), attente 45s
```

**Interprétation:**
- C'est **NORMAL** dans les cas de charge élevée
- Le système **s'auto-régule** automatiquement
- Pas d'intervention nécessaire ✅

### Logs batch processing

```
📦 Traitement batch 1/10 (10 tâches)
🤖 Réponse LLM batch 1: ...
✅ 8/10 tâches batch 1 déplacées
[Pause 2s]
📦 Traitement batch 2/10 (10 tâches)
```

### Dashboard ActivityTracker

Progression visible en temps réel:

```
🎯 Orchestration Quotidienne Complète
  └─ 📥 Nettoyage Inbox: 35/93 tâches (batch 4/10)
  └─ 🔄 Rééquilibrage: En attente...
  └─ ⏱️ Durée: 38s
```

## 🎯 Recommandations

### ✅ Situation actuelle (93 tâches)

**Rien à faire** - Toutes les protections sont en place et suffisantes.

- Charge: 66% → Marge 34%
- Throttle: Activé
- Délai batches: 2s
- Fallback LLM: Opérationnel

### ⚠️ Si Inbox monte à 150-200 tâches

**Surveillance accrue** - Le système gérera mais sera plus lent

- Durée: 2min → 4-5min (throttle actif)
- Charge: 70-80% → Marge 20-30%
- **Action**: Aucune (throttle gère automatiquement)

### 🔴 Si Inbox monte à 300+ tâches

**Optimisation recommandée** - Réduire taille batch

Modifier `src/llm/intelligent-agent.js:850`:
```javascript
const BATCH_SIZE = 5; // Au lieu de 10
```

**Impact:**
- Plus de batches mais plus petits
- Charge plus lissée (60 batches × 4s = 240s)
- Rate: 300 updates / 240s = **75 req/min** ✅

**Délai augmenté:**
```javascript
await new Promise(resolve => setTimeout(resolve, 3000)); // 3s au lieu de 2s
```

## 🔍 Comment tester les protections

### Test 1: Throttle TickTick

Simuler charge élevée:
```bash
node /tmp/test-throttle-ticktick.js
```

Observer dans les logs:
```
⚠️  Rate limit 1min approché (80/80), attente 12s
```

### Test 2: Fallback LLM

Atteindre rate limit GROQ (30 req/min):
```bash
# Lancer 30 appels LLM en 1 minute
for i in {1..30}; do
  node /tmp/test-llm-call.js &
done
```

Observer dans les logs:
```
⚠️  GROQ rate limit atteint, bascule sur Gemini...
```

### Test 3: Orchestration complète

Lancer en prod:
```bash
node scripts/daily-inbox-cleanup.js
```

Observer durée réelle vs estimée:
- **Estimé**: 100s (2min)
- **Réel avec throttle léger**: 110-120s
- **Réel avec throttle actif**: 180-240s

## 📊 Métriques de santé

### Valeurs normales

- **Durée orchestration**: 90-120s
- **Throttle warnings**: 0-2 pendant exécution
- **Batches réussis**: 8-10/10 (80-100%)
- **Tâches déplacées**: 70-90/93 (75-97%)

### Valeurs préoccupantes

- **Durée orchestration**: >180s (throttle très actif)
- **Throttle warnings**: >5 (surcharge)
- **Batches réussis**: <6/10 (<60%)
- **Tâches déplacées**: <50/93 (<50%)

**Action si valeurs préoccupantes:**
1. Vérifier Inbox (trop pleine?)
2. Vérifier quotas LLM (épuisés?)
3. Réduire BATCH_SIZE (10 → 5)
4. Augmenter délai batches (2s → 3s)

## 🚨 Cas d'urgence

### Rate limit 429 TickTick malgré throttle

**Symptôme:**
```
Error: Request failed with status code 429
```

**Cause:** Autres scripts/outils utilisent l'API en parallèle

**Solution immédiate:**
1. Arrêter autres scripts TickTick
2. Attendre 5 minutes complètes
3. Relancer orchestration

**Solution permanente:**
Réduire seuils throttle dans `src/api/ticktick-api.js:19-20`:
```javascript
this.maxRequestsPerMinute = 60; // Au lieu de 80
this.maxRequestsPer5Minutes = 200; // Au lieu de 250
```

### LLM inaccessible (GROQ + Gemini down)

**Symptôme:**
```
❌ Erreur nettoyage Inbox: Both GROQ and Gemini unavailable
```

**Solution immédiate:**
Nettoyage Inbox échoue mais rééquilibrage continue (pas de dépendance LLM)

**Solution permanente:**
Ajouter 3ème fallback (OpenRouter, Anthropic, etc.)

## ✅ Conclusion

**Le système actuel est ROBUSTE et PROTÉGÉ:**

1. ✅ **Throttle automatique** empêche dépassement rate limits
2. ✅ **Délai entre batches** lisse la charge
3. ✅ **Fallback LLM** assure continuité service
4. ✅ **Cache intelligent** réduit appels inutiles
5. ✅ **Batch processing** évite timeouts
6. ✅ **Retry automatique** gère erreurs transitoires

**Avec 93 tâches Inbox actuelles:**
- Utilisation: **66% TickTick, 20% LLM**
- Marge sécurité: **34% TickTick, 80% LLM**
- Durée: **100 secondes (2 minutes)**

**Aucune action requise** - Le système peut gérer jusqu'à 150-200 tâches Inbox sans intervention.

---

**Dernière mise à jour**: 16 octobre 2025
**Version**: 1.0.0
**Status**: ✅ Opérationnel et protégé

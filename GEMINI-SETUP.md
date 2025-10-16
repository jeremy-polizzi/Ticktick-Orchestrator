# 🔵 Configuration Google Gemini (Fallback LLM)

## 🎯 Pourquoi Gemini ?

Quand GROQ atteint sa limite quotidienne (100k tokens/jour), le système **bascule automatiquement** sur Google Gemini.

**Avantages:**
- ✅ Gratuit jusqu'à **1500 requêtes/jour** (15k tokens par requête)
- ✅ Fallback automatique (pas d'interruption)
- ✅ Modèle puissant (Gemini 1.5 Pro)
- ✅ Aucune carte bancaire requise

---

## 📝 Obtenir une Clé API Gemini (2 minutes)

### Étape 1: Aller sur Google AI Studio

Ouvrir: **https://aistudio.google.com/apikey**

### Étape 2: Se Connecter

- Utiliser compte Google existant
- Aucune carte bancaire demandée

### Étape 3: Créer une Clé API

1. Cliquer **"Get API key"** ou **"Create API key"**
2. Sélectionner un projet Google Cloud (ou créer nouveau)
3. Copier la clé générée (format: `AIzaSy...`)

### Étape 4: Ajouter dans .env

Éditer `/root/Ticktick-Orchestrator/.env`:

```bash
GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Étape 5: Redémarrer le Serveur

```bash
pm2 restart ticktick-orchestrator
```

---

## 🧪 Tester le Fallback

### Script de Test

```bash
node /tmp/test-gemini-fallback.js
```

Le script va:
1. ✅ Vérifier que Gemini est configuré
2. ✅ Simuler un rate limit GROQ
3. ✅ Vérifier que le fallback sur Gemini fonctionne

---

## 🔄 Comment ça Marche ?

### Scénario Automatique

```
1. Commande LLM reçue: "Crée une tâche X"
   ↓
2. Essayer GROQ (Llama 3.3 70B) d'abord
   ↓
3. GROQ rate limit atteint (429) ?
   ↓ OUI
4. ⚠️  "GROQ rate limit atteint, bascule sur Gemini..."
   ↓
5. Appeler Gemini 1.5 Pro
   ↓
6. ✅ Réponse via Google Gemini (fallback)
```

**Résultat:** Aucune interruption pour l'utilisateur

---

## 📊 Limites Gemini

| Type | Limite | Notes |
|------|--------|-------|
| Requêtes/jour | 1500 | Gratuit |
| Requêtes/minute | 15 | Gratuit |
| Tokens/requête | 32k input, 8k output | Très généreux |

**Comparaison:**
- GROQ: 100k tokens/jour (limite basse)
- Gemini: 1500 req/jour × 15k tokens = **22.5M tokens/jour** (limite haute)

---

## 🎯 Recommandation

**Configurer Gemini MAINTENANT** pour éviter toute interruption quand GROQ atteint sa limite.

---

## ⚡ Configuration Rapide (1 ligne)

```bash
# 1. Obtenir clé: https://aistudio.google.com/apikey
# 2. Remplacer VOTRE_CLE dans la commande ci-dessous
sed -i 's/GEMINI_API_KEY=$/GEMINI_API_KEY=VOTRE_CLE/' /root/Ticktick-Orchestrator/.env && pm2 restart ticktick-orchestrator
```

---

**Fichier modifié:** `src/llm/intelligent-agent.js`
- Ajout méthode `callLLM()` avec fallback automatique
- Support GROQ + Gemini simultanés
- Bascule transparente sur rate limit

*Configuration créée le 2025-10-16*

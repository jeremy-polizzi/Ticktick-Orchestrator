# 📅 Planification Intelligente sur 60 Jours

## Vue d'ensemble

Le système de planification intelligente distribue automatiquement vos tâches TickTick sur un horizon de 60 jours, en maintenant une charge légère et équilibrée.

## Principes de fonctionnement

### 1. Horizon de planification étendu

- **60 jours** de planification automatique (vs 14 jours auparavant)
- Analyse complète des créneaux disponibles sur toute la période
- Détection automatique des jours avec sport pour ajuster les horaires

### 2. Charge légère garantie

- **Maximum 2 tâches par jour** (configurable via `MAX_DAILY_TASKS`)
- Distribution équilibrée pour éviter les pics de charge
- Respect de la vie personnelle et des imprévus

### 3. Règles d'espacement

- **Buffer de 15 minutes** avant et après chaque événement
- Pas de tâches collées aux événements existants
- Pas de placement le matin les jours de sport (horaires ajustés à partir de 12h)

### 4. Redistribution automatique

Le système redistribue automatiquement:
- Les tâches sans date
- Les tâches avec dates passées non terminées
- Les tâches des jours manqués (1-3 jours)

### 5. Équilibrage intelligent

- Détection automatique des jours surchargés
- Redistribution vers les jours moins chargés
- Maintien d'une moyenne de charge uniforme

## Configuration

### Variables d'environnement (.env)

```env
# Nombre de jours pour la planification (par défaut: 60)
PLANNING_HORIZON_DAYS=60

# Charge maximale par jour (par défaut: 2)
MAX_DAILY_TASKS=2

# Heure de la réorganisation quotidienne (par défaut: 06:00)
DAILY_SCHEDULER_TIME=06:00
```

### Fichier de configuration (src/config/config.js)

```javascript
scheduler: {
  dailyTime: '06:00',                     // Heure d'exécution quotidienne
  syncInterval: 30,                       // Sync toutes les 30 min
  maxDailyTasks: 2,                       // 2 tâches max/jour
  planningHorizonDays: 60,                // Planification sur 60 jours
  timezone: 'Europe/Paris'
}
```

## Priorités et placement intelligent

### Sélection du meilleur créneau

Le système choisit le créneau optimal selon le type de tâche:

1. **Tâches urgentes** → Premier créneau disponible
2. **Tâches créatives** (développement, design, rédaction) → Après-midi (14h+)
3. **Tâches importantes** (priorité ≥ 3) → Créneau le plus long
4. **Autres tâches** → Premier créneau disponible

### Estimation automatique de durée

- **Développement/Création**: 120 minutes
- **Formation/Rédaction**: 90 minutes
- **Appel/Email**: 30 minutes
- **Défaut**: 60 minutes

## Compatibilité jour/tâche

### Jours de semaine (Lundi-Vendredi)

Priorité aux tâches:
- Business (client, travail, réunion)
- Professionnelles
- Administratives

### Weekend (Samedi-Dimanche)

Priorité aux tâches:
- Personnelles
- Familiales
- Privées

## Processus de réorganisation quotidienne

Exécuté automatiquement chaque jour à **6h** (configurable):

1. **Vérification système** - Connexions TickTick + Google Calendar
2. **Synchronisation complète** - Récupération des tâches et événements
3. **Analyse des créneaux** - Scan des 60 prochains jours
4. **Priorisation** - Calcul des priorités selon complexité/urgence/durée
5. **Distribution intelligente** - Placement optimal des tâches
6. **Équilibrage** - Lissage de la charge entre les jours
7. **Application** - Mise à jour des dates dans TickTick
8. **Rapport** - Génération du rapport quotidien

## Tests

### Test complet de la planification

```bash
node test-60-day-planning.js
```

Vérifie:
- ✅ Analyse des 60 jours
- ✅ Distribution équilibrée
- ✅ Respect de la charge maximale
- ✅ Espacement et buffer
- ✅ Détection du sport

### Test des règles d'espacement

```bash
node test-scheduling-rules.js
```

Vérifie:
- ✅ Buffer de 15 minutes
- ✅ Détection sport
- ✅ Exclusion matins (jours sport)
- ✅ Placement intelligent

## Utilisation

### Démarrage automatique

Le scheduler démarre automatiquement avec l'application:

```bash
npm start
```

### Exécution manuelle unique

Pour forcer une réorganisation immédiate:

```bash
node src/scheduler/daily-scheduler.js --run-once
```

### API REST

```bash
# Déclencher une réorganisation manuelle
POST /api/scheduler/run

# Statut du scheduler
GET /api/scheduler/status
```

## Statistiques et monitoring

Le système génère automatiquement:

- **Logs détaillés** dans `data/logs/orchestrator.log`
- **Rapport quotidien** avec métriques de distribution
- **Alertes** en cas de jours surchargés
- **Statistiques** de charge et productivité

## Algorithme d'équilibrage

```
1. Calculer la charge moyenne sur 60 jours
2. Identifier les jours > moyenne * 1.5
3. Pour chaque jour surchargé:
   - Calculer l'excès de tâches
   - Trouver des jours sous-chargés
   - Déplacer les tâches moins prioritaires
4. Vérifier que tous les jours respectent le max
```

## Exemples de scénarios

### Scénario 1: Tâches manquées

**Situation**: Vous n'avez pas fait vos tâches pendant 3 jours

**Action automatique**:
1. Le scheduler détecte les 6 tâches en retard (2 tâches × 3 jours)
2. Recalcule les priorités (augmente urgence)
3. Redistribue sur les 60 prochains jours
4. Place en priorité les tâches urgentes
5. Équilibre le reste sur les jours disponibles

**Résultat**: Charge toujours à 2 tâches/jour maximum, répartition équilibrée

### Scénario 2: Nouvelle grosse livraison

**Situation**: Ajout de 30 nouvelles tâches d'un coup

**Action automatique**:
1. Analyse des 60 jours disponibles
2. Capacité totale = 60 jours × 2 tâches = 120 tâches
3. Distribution intelligente des 30 tâches sur les meilleurs créneaux
4. Respect des priorités et compatibilités (business vs perso)
5. Équilibrage pour éviter les pics

**Résultat**: 30 tâches réparties sur ~15 jours, charge équilibrée

### Scénario 3: Semaine chargée d'événements

**Situation**: Semaine avec beaucoup d'appels et réunions

**Action automatique**:
1. Détection des jours avec peu de créneaux disponibles
2. Réduction automatique du nombre de tâches ces jours-là
3. Report des tâches vers la semaine suivante
4. Maintien de la charge légère malgré l'agenda chargé

**Résultat**: Pas de surcharge, tâches déplacées intelligemment

## Avantages du système 60 jours

### ✅ Visibilité long terme

- Planification sereine sur 2 mois
- Anticipation des périodes chargées
- Pas de stress de dernière minute

### ✅ Charge légère garantie

- Maximum 2 tâches/jour
- Respect de la vie personnelle
- Place pour les imprévus

### ✅ Distribution intelligente

- Pas de jours surchargés
- Équilibrage automatique
- Optimisation selon contexte

### ✅ Flexibilité

- S'adapte aux changements d'agenda
- Redistribue automatiquement si nécessaire
- Respecte les priorités

### ✅ Automatique

- Réorganisation quotidienne à 6h
- Zéro intervention manuelle
- Synchronisation continue

## Limitations connues

- **Créneaux limités**: Si l'agenda est très chargé pendant 60 jours, capacité réduite
- **Tâches urgentes**: Les tâches avec deadline fixe peuvent dépasser la limite
- **Weekend**: Moins de créneaux si préférence pour tâches personnelles uniquement

## Évolutions futures possibles

- Apprentissage des patterns de productivité
- Suggestions de regroupement de tâches similaires
- Détection automatique des périodes de vacances
- Ajustement dynamique de la charge selon la fatigue
- Prédiction de la durée réelle vs estimée

---

**Configuration actuelle**: 60 jours, 2 tâches max/jour, buffer 15min

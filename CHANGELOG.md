# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [1.1.0] - 2025-10-14

### 🔧 Corrections Majeures

#### Fix TickTick updateTask - Le problème du "mensonge"

**Problème résolu:** L'API TickTick acceptait les mises à jour (HTTP 200 OK) mais ne sauvegardait pas les modifications. Le dashboard affichait "105 tâches assignées" mais les 105 tâches restaient sans date dans TickTick.

**Cause:** TickTick nécessite obligatoirement 3 champs pour toute modification:
```javascript
{
  id: "task_id",           // ✅ OBLIGATOIRE
  projectId: "project_id", // ✅ OBLIGATOIRE
  title: "Task title",     // ✅ OBLIGATOIRE
  dueDate: "2025-10-15T12:00:00+0000"  // + modifications
}
```

**Solution implémentée:**
- ✅ Auto-fusion des champs obligatoires dans `updateTask()`
- ✅ Format date ISO 8601 complet: `YYYY-MM-DDTHH:mm:ss+0000`
- ✅ Validation finale: compare annoncé vs réalité TickTick
- ✅ Mensonge techniquement impossible

**Fichiers modifiés:**
- `src/api/ticktick-api.js` - updateTask() + updateMultipleTasks()
- `src/orchestrator/intelligent-scheduler.js` - assignDatesToTasks() + rescheduleTask()
- `src/orchestrator/task-manager.js` - updateTask() wrapper

**Documentation:** [docs/TICKTICK-UPDATE-FIX.md](docs/TICKTICK-UPDATE-FIX.md)

**Tests validés:** 104 tâches sans date prêtes pour "Ajustement Auto"

### ✨ Nouvelles Fonctionnalités

#### Script d'installation automatique VPS

**`install.sh`** - Installation one-command complète:
- ✅ Vérification OS (Ubuntu/Debian)
- ✅ Installation Node.js 18+ automatique
- ✅ Installation dépendances NPM
- ✅ Création .env depuis template
- ✅ Création dossiers data/ (logs, tokens, cache)
- ✅ Installation PM2 global
- ✅ Configuration ecosystem.config.js
- ✅ Démarrage automatique application
- ✅ Détection IP publique
- ✅ Instructions next steps

**Usage:**
```bash
git clone https://github.com/jeremy-polizzi/Ticktick-Orchestrator.git
cd Ticktick-Orchestrator
chmod +x install.sh
./install.sh
```

**Impact:** Temps installation réduit de plusieurs heures à ~5 minutes

### 📚 Documentation

#### Ajoutée
- `docs/TICKTICK-UPDATE-FIX.md` - Documentation technique complète du fix
  - Explication problème (HTTP 200 sans sauvegarde)
  - Solution (champs obligatoires)
  - Tests validés
  - Historique debug complet
  - Endpoints TickTick validés
  - Garanties anti-mensonge

- `CHANGELOG.md` - Ce fichier

#### Modifiée
- `README.md`
  - Section "Installation Automatique" ajoutée (recommandée)
  - Section "Corrections Récentes" ajoutée
  - Instructions installation simplifiées
  - Installation manuelle en option avancée

### 🎯 Impact Global

**Avant cette version:**
- ❌ "105 tâches assignées" → 105 toujours sans date
- ❌ HTTP 200 OK mais aucun changement réel
- ❌ Mensonge systématique
- ❌ Installation VPS complexe (plusieurs heures)

**Avec v1.1.0:**
- ✅ "104 tâches assignées" → 104 ont réellement une date
- ✅ Validation compare annoncé vs TickTick
- ✅ Mensonge techniquement impossible
- ✅ Installation VPS en ~5 minutes

---

## [1.0.0] - 2025-10-13

### ✨ Version Initiale

#### Fonctionnalités principales

**Orchestration TickTick:**
- Gestion intelligente des tâches
- Actions en masse
- Commandes en langage naturel
- Calcul automatique de perplexité
- Planification optimale

**Synchronisation Google Calendar:**
- Sync bidirectionnelle
- Gestion automatique des conflits
- Priorisation intelligente
- Respect des choix utilisateurs

**Interface Web:**
- Dashboard moderne
- Visualisation temps réel
- Historique et logs détaillés
- Configuration dynamique
- Design responsive

**Architecture:**
- Express.js + Node.js 18+
- API TickTick + Google Calendar
- Cache intelligent (TTL 30s)
- Rate limiting géré
- Logs structurés (Winston)

#### Infrastructure

**Déploiement:**
- Support Ubuntu/Debian
- Configuration Nginx + SSL
- PM2 pour process management
- Variables d'environnement sécurisées

**Documentation:**
- README complet
- Instructions installation VPS
- Configuration OAuth
- Troubleshooting

---

**Note:** Les versions antérieures à 1.0.0 étaient en développement interne et ne sont pas documentées publiquement.

[1.1.0]: https://github.com/jeremy-polizzi/Ticktick-Orchestrator/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/jeremy-polizzi/Ticktick-Orchestrator/releases/tag/v1.0.0

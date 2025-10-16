#!/usr/bin/env node

/**
 * 🎯 Script cron pour ORCHESTRATION QUOTIDIENNE COMPLÈTE
 *
 * S'exécute une fois par jour (8h du matin)
 *
 * WORKFLOW COMPLET:
 * 1. Nettoyage Inbox (classification LLM intelligente)
 * 2. Rééquilibrage 60 jours (2-3 tâches/jour max)
 * 3. Optimisation planning (tâches courtes week-end)
 *
 * RÈGLES STRICTES:
 * - Planification à partir de DEMAIN (jamais aujourd'hui)
 * - Max 2-3 tâches/jour
 * - Tâches courtes (≤1h) le week-end
 * - Tâches longues (>2h) en semaine
 * - Répartition équilibrée sur 60 jours
 *
 * Le LLM décide tout: projet, durée, priorité, deadline, tags
 */

const DailyOrchestrator = require('../src/orchestrator/daily-orchestrator');
const logger = require('../src/utils/logger');

async function runDailyOrchestration() {
  try {
    const orchestrator = new DailyOrchestrator();

    // Initialiser l'orchestrateur
    await orchestrator.initialize();

    // Lancer l'orchestration complète
    const report = await orchestrator.performDailyOrchestration();

    // Vérifier le résultat et sortir avec le bon code
    if (report.success) {
      process.exit(0); // Succès
    } else {
      logger.error('⚠️ Orchestration partielle - certaines étapes ont échoué');
      process.exit(1); // Échec partiel
    }

  } catch (error) {
    logger.error('❌ Cron: Erreur orchestration quotidienne:', error.message);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Exécuter l'orchestration
runDailyOrchestration();

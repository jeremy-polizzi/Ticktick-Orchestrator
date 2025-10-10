#!/usr/bin/env node

/**
 * Script cron pour ajustement continu automatique
 * S'exécute toutes les 30 minutes pour reschedule automatiquement les tâches
 */

const IntelligentScheduler = require('../src/orchestrator/intelligent-scheduler');
const logger = require('../src/utils/logger');

async function runContinuousAdjust() {
  logger.info('🔄 Cron: Démarrage ajustement continu automatique');

  try {
    const scheduler = new IntelligentScheduler();

    await scheduler.initialize();
    logger.info('✅ IntelligentScheduler initialisé');

    const rescheduled = await scheduler.performContinuousAdjustment();

    logger.info(`✅ Cron: Ajustement continu terminé - ${rescheduled} tâches replanifiées`);

  } catch (error) {
    logger.error('❌ Cron: Erreur ajustement continu:', error.message);
    process.exit(1);
  }
}

runContinuousAdjust();

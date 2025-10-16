const IntelligentAgent = require('../llm/intelligent-agent');
const IntelligentScheduler = require('./intelligent-scheduler');
const logger = require('../utils/logger');

/**
 * 🎯 ORCHESTRATEUR QUOTIDIEN COMPLET
 *
 * Workflow automatique qui s'exécute chaque jour pour:
 * 1. Nettoyer l'Inbox (classification LLM intelligente)
 * 2. Rééquilibrer toutes les tâches sur 60 jours
 * 3. Optimiser la planification (tâches courtes week-end)
 * 4. Ajuster les priorités
 * 5. Gérer les conflits
 *
 * Utilisé par:
 * - Cron quotidien (8h du matin)
 * - Bouton "Ajustement Auto" du dashboard
 */
class DailyOrchestrator {
  constructor() {
    this.agent = new IntelligentAgent();
    this.scheduler = new IntelligentScheduler();
  }

  async initialize() {
    logger.info('🎯 Initialisation DailyOrchestrator...');
    await this.agent.initialize();
    await this.scheduler.initialize();
    logger.info('✅ DailyOrchestrator initialisé');
  }

  /**
   * 🚀 ORCHESTRATION QUOTIDIENNE COMPLÈTE
   *
   * Exécute le workflow complet dans l'ordre optimal:
   * 1. Nettoyage Inbox (classification intelligente)
   * 2. Rééquilibrage 60 jours (2-3 tâches/jour max)
   * 3. Optimisation planning (week-end/semaine)
   */
  async performDailyOrchestration() {
    const startTime = Date.now();
    logger.info('🎯 ═══════════════════════════════════════════════════════');
    logger.info('🎯 DÉMARRAGE ORCHESTRATION QUOTIDIENNE COMPLÈTE');
    logger.info('🎯 ═══════════════════════════════════════════════════════');

    const report = {
      success: false,
      startTime: new Date().toISOString(),
      steps: [],
      totalDuration: 0
    };

    try {
      // ═══════════════════════════════════════════════════════════
      // ÉTAPE 1: NETTOYAGE INBOX (Classification LLM intelligente)
      // ═══════════════════════════════════════════════════════════
      logger.info('');
      logger.info('📥 ÉTAPE 1/2: Nettoyage Inbox avec LLM');
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      const step1Start = Date.now();
      let inboxResult = null;

      try {
        inboxResult = await this.agent.processInboxToProjects();

        const step1Duration = Date.now() - step1Start;

        if (inboxResult.success) {
          logger.info(`✅ Inbox nettoyé: ${inboxResult.moved}/${inboxResult.total} tâches classées (${step1Duration}ms)`);
          report.steps.push({
            name: 'inbox_cleanup',
            success: true,
            tasksTotal: inboxResult.total,
            tasksMoved: inboxResult.moved,
            tasksFailed: inboxResult.failed,
            duration: step1Duration
          });
        } else {
          logger.warn(`⚠️ Nettoyage Inbox partiel: ${inboxResult.error}`);
          report.steps.push({
            name: 'inbox_cleanup',
            success: false,
            error: inboxResult.error,
            duration: step1Duration
          });
        }

      } catch (error) {
        const step1Duration = Date.now() - step1Start;
        logger.error(`❌ Erreur nettoyage Inbox: ${error.message}`);
        report.steps.push({
          name: 'inbox_cleanup',
          success: false,
          error: error.message,
          duration: step1Duration
        });
      }

      // ═══════════════════════════════════════════════════════════
      // ÉTAPE 2: RÉÉQUILIBRAGE INTELLIGENT 60 JOURS
      // ═══════════════════════════════════════════════════════════
      logger.info('');
      logger.info('🔄 ÉTAPE 2/2: Rééquilibrage intelligent sur 60 jours');
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.info('Règles:');
      logger.info('  • Max 2-3 tâches/jour');
      logger.info('  • Tâches courtes (≤1h) → Week-end');
      logger.info('  • Tâches longues (>2h) → Semaine');
      logger.info('  • Planification à partir de DEMAIN');
      logger.info('  • Réorganisation complète si tâches reportées');

      const step2Start = Date.now();
      let adjustResult = null;

      try {
        adjustResult = await this.scheduler.performContinuousAdjustment();

        const step2Duration = Date.now() - step2Start;

        if (adjustResult && adjustResult.tasksRescheduled !== undefined) {
          logger.info(`✅ Rééquilibrage terminé: ${adjustResult.tasksRescheduled} tâches replanifiées (${step2Duration}ms)`);
          logger.info(`   Conflits détectés: ${adjustResult.conflictsDetected || 0}`);
          logger.info(`   Tâches analysées: ${adjustResult.tasksAnalyzed || 0}`);

          report.steps.push({
            name: 'continuous_adjust',
            success: true,
            tasksAnalyzed: adjustResult.tasksAnalyzed || 0,
            tasksRescheduled: adjustResult.tasksRescheduled,
            conflictsDetected: adjustResult.conflictsDetected || 0,
            duration: step2Duration
          });
        } else {
          logger.info(`✅ Rééquilibrage terminé sans modification (${step2Duration}ms)`);
          report.steps.push({
            name: 'continuous_adjust',
            success: true,
            tasksRescheduled: 0,
            duration: step2Duration
          });
        }

      } catch (error) {
        const step2Duration = Date.now() - step2Start;
        logger.error(`❌ Erreur rééquilibrage: ${error.message}`);
        report.steps.push({
          name: 'continuous_adjust',
          success: false,
          error: error.message,
          duration: step2Duration
        });
      }

      // ═══════════════════════════════════════════════════════════
      // RAPPORT FINAL
      // ═══════════════════════════════════════════════════════════
      const totalDuration = Date.now() - startTime;
      report.totalDuration = totalDuration;
      report.success = report.steps.every(s => s.success);

      logger.info('');
      logger.info('🎯 ═══════════════════════════════════════════════════════');
      logger.info('🎯 ORCHESTRATION QUOTIDIENNE TERMINÉE');
      logger.info('🎯 ═══════════════════════════════════════════════════════');
      logger.info('');
      logger.info('📊 RÉSUMÉ:');
      logger.info('');

      // Stats Inbox
      const inboxStep = report.steps.find(s => s.name === 'inbox_cleanup');
      if (inboxStep && inboxStep.success) {
        logger.info(`  📥 Inbox:`);
        logger.info(`     • ${inboxStep.tasksMoved}/${inboxStep.tasksTotal} tâches classées`);
        logger.info(`     • ${inboxStep.tasksFailed || 0} échecs`);
        logger.info(`     • Durée: ${Math.round(inboxStep.duration / 1000)}s`);
      } else if (inboxStep) {
        logger.info(`  📥 Inbox: ❌ ${inboxStep.error}`);
      }

      // Stats Rééquilibrage
      const adjustStep = report.steps.find(s => s.name === 'continuous_adjust');
      if (adjustStep && adjustStep.success) {
        logger.info(`  🔄 Rééquilibrage:`);
        logger.info(`     • ${adjustStep.tasksRescheduled} tâches replanifiées`);
        logger.info(`     • ${adjustStep.conflictsDetected || 0} conflits résolus`);
        logger.info(`     • ${adjustStep.tasksAnalyzed || 0} tâches analysées`);
        logger.info(`     • Durée: ${Math.round(adjustStep.duration / 1000)}s`);
      } else if (adjustStep) {
        logger.info(`  🔄 Rééquilibrage: ❌ ${adjustStep.error}`);
      }

      logger.info('');
      logger.info(`  ⏱️  Durée totale: ${Math.round(totalDuration / 1000)}s`);
      logger.info(`  📈 Statut: ${report.success ? '✅ SUCCÈS' : '⚠️ PARTIEL'}`);
      logger.info('');

      if (report.success) {
        logger.info('🎉 Orchestration quotidienne réussie!');
      } else {
        logger.warn('⚠️ Orchestration quotidienne partielle (certaines étapes ont échoué)');
      }

      logger.info('🎯 ═══════════════════════════════════════════════════════');

      return report;

    } catch (error) {
      report.success = false;
      report.error = error.message;
      report.totalDuration = Date.now() - startTime;

      logger.error('🎯 ═══════════════════════════════════════════════════════');
      logger.error('❌ ERREUR ORCHESTRATION QUOTIDIENNE');
      logger.error('🎯 ═══════════════════════════════════════════════════════');
      logger.error(`Erreur: ${error.message}`);
      logger.error(error.stack);

      return report;
    }
  }
}

module.exports = DailyOrchestrator;

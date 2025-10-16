#!/usr/bin/env node

/**
 * 🗂️ Script cron pour nettoyage quotidien Inbox
 *
 * S'exécute une fois par jour (matin, après wake-up)
 * Analyse toutes les tâches Inbox et les classe intelligemment dans leurs projets
 * avec estimation durée, priorités, et planification sur 60 jours.
 *
 * RÈGLES STRICTES:
 * - Planification à partir de DEMAIN (jamais aujourd'hui)
 * - Max 2-3 tâches/jour
 * - Tâches courtes le week-end
 * - Répartition équilibrée sur 60 jours
 *
 * Le LLM décide tout: projet, durée, priorité, deadline, tags
 */

const IntelligentAgent = require('../src/llm/intelligent-agent');
const logger = require('../src/utils/logger');

async function runDailyInboxCleanup() {
  logger.info('🗂️ ═══════════════════════════════════════════════════════');
  logger.info('🗂️ Cron: Démarrage nettoyage quotidien Inbox');
  logger.info('🗂️ ═══════════════════════════════════════════════════════');

  try {
    const agent = new IntelligentAgent();

    // Initialiser le LLM et les APIs
    await agent.initialize();
    logger.info('✅ IntelligentAgent initialisé (GROQ + Gemini fallback)');

    // Lancer le nettoyage Inbox
    const result = await agent.processInboxToProjects();

    if (result.success) {
      logger.info('🗂️ ═══════════════════════════════════════════════════════');
      logger.info(`🎉 Nettoyage Inbox terminé avec succès!`);
      logger.info(`📊 Statistiques:`);
      logger.info(`   - Tâches Inbox trouvées: ${result.total}`);
      logger.info(`   - Tâches traitées:       ${result.processed}`);
      logger.info(`   - Tâches déplacées:      ${result.moved}`);
      logger.info(`   - Échecs:                ${result.failed}`);
      logger.info('🗂️ ═══════════════════════════════════════════════════════');

      if (result.moved > 0) {
        logger.info('📋 Aperçu des déplacements:');
        result.results.slice(0, 5).forEach((r, i) => {
          if (r.success) {
            logger.info(`   ${i + 1}. "${r.title}" → ${r.project}`);
          }
        });
        if (result.results.length > 5) {
          logger.info(`   ... et ${result.results.length - 5} autres`);
        }
      }

      // Note sur le rééquilibrage automatique
      if (result.moved > 0) {
        logger.info('');
        logger.info('ℹ️  Note: Le continuous-adjust s\'exécutera automatiquement toutes les 30min');
        logger.info('   pour rééquilibrer la charge si des tâches sont reportées.');
      }
    } else {
      logger.error(`❌ Échec nettoyage Inbox: ${result.error}`);
      process.exit(1);
    }

  } catch (error) {
    logger.error('❌ Cron: Erreur nettoyage Inbox:', error.message);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Exécuter le nettoyage
runDailyInboxCleanup();

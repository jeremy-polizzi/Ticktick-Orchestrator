const express = require('express');
const router = express.Router();
const DailyScheduler = require('../../scheduler/daily-scheduler');
const logger = require('../../utils/logger');

// Instance du scheduler
const scheduler = new DailyScheduler();

// Initialiser le scheduler (démarrage manuel via l'interface)
scheduler.initialize().catch(error => {
  logger.error('Erreur lors de l\'initialisation du DailyScheduler:', error.message);
});

// === CONTRÔLE DU SCHEDULER ===

// Obtenir le statut du scheduler
router.get('/status', (req, res) => {
  try {
    const status = scheduler.getSchedulerStatus();

    res.json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors de la récupération du statut du scheduler:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la récupération du statut',
      details: error.message
    });
  }
});

// Démarrer le scheduler
router.post('/start', async (req, res) => {
  try {
    const success = scheduler.startScheduler();

    if (success) {
      logger.info('Scheduler démarré via API');
      res.json({
        success: true,
        message: 'Scheduler démarré avec succès',
        status: scheduler.getSchedulerStatus()
      });
    } else {
      res.status(500).json({
        error: 'Échec du démarrage du scheduler'
      });
    }

  } catch (error) {
    logger.error('Erreur lors du démarrage du scheduler:', error.message);
    res.status(500).json({
      error: 'Erreur lors du démarrage du scheduler',
      details: error.message
    });
  }
});

// Arrêter le scheduler
router.post('/stop', async (req, res) => {
  try {
    const success = scheduler.stopScheduler();

    if (success) {
      logger.info('Scheduler arrêté via API');
      res.json({
        success: true,
        message: 'Scheduler arrêté avec succès'
      });
    } else {
      res.status(500).json({
        error: 'Échec de l\'arrêt du scheduler'
      });
    }

  } catch (error) {
    logger.error('Erreur lors de l\'arrêt du scheduler:', error.message);
    res.status(500).json({
      error: 'Erreur lors de l\'arrêt du scheduler',
      details: error.message
    });
  }
});

// === EXÉCUTION MANUELLE ===

// Lancer l'organisation quotidienne manuellement
router.post('/run', async (req, res) => {
  try {
    if (scheduler.isRunning) {
      return res.status(409).json({
        error: 'Organisation déjà en cours',
        message: 'Une organisation quotidienne est déjà en cours d\'exécution'
      });
    }

    logger.info('Organisation quotidienne déclenchée manuellement via API');

    // Exécution asynchrone pour ne pas bloquer la réponse
    scheduler.runManualOrganization()
      .then(report => {
        logger.info('Organisation manuelle terminée avec succès');
      })
      .catch(error => {
        logger.error('Erreur lors de l\'organisation manuelle:', error.message);
      });

    res.json({
      success: true,
      message: 'Organisation quotidienne démarrée',
      status: 'running',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors du lancement de l\'organisation:', error.message);
    res.status(500).json({
      error: 'Erreur lors du lancement de l\'organisation',
      details: error.message
    });
  }
});

// Lancer une synchronisation manuelle
router.post('/sync', async (req, res) => {
  try {
    logger.info('Synchronisation manuelle déclenchée via API');

    const startTime = Date.now();
    await scheduler.calendarSync.performFullSync();
    const duration = Date.now() - startTime;

    logger.info(`Synchronisation manuelle terminée en ${duration}ms`);

    res.json({
      success: true,
      message: 'Synchronisation terminée avec succès',
      duration,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors de la synchronisation manuelle:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la synchronisation',
      details: error.message
    });
  }
});

// === RAPPORTS ===

// Générer un rapport quotidien
router.get('/report/daily', async (req, res) => {
  try {
    const report = await scheduler.generateDailyReport();

    res.json({
      success: true,
      report,
      generated: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors de la génération du rapport:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la génération du rapport',
      details: error.message
    });
  }
});

// Obtenir l'historique des exécutions (simplifié)
router.get('/history', async (req, res) => {
  try {
    // Ici on pourrait implémenter un vrai système de persistance
    // Pour l'instant, retourner des informations basiques

    const { limit = 10 } = req.query;

    const history = {
      lastRun: scheduler.lastRunTime || null,
      schedulerStatus: scheduler.getSchedulerStatus(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      // Placeholder pour un vrai historique
      executions: []
    };

    res.json({
      success: true,
      history,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors de la récupération de l\'historique:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la récupération de l\'historique',
      details: error.message
    });
  }
});

// === ANALYSE ET OPTIMISATION ===

// Analyser les patterns de charge de travail
router.get('/analysis/workload', async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const analysis = await scheduler.analyzeWorkloadPatterns();

    res.json({
      success: true,
      analysis,
      daysAnalyzed: parseInt(days),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors de l\'analyse de la charge:', error.message);
    res.status(500).json({
      error: 'Erreur lors de l\'analyse de la charge',
      details: error.message
    });
  }
});

// Obtenir des suggestions d'optimisation
router.get('/suggestions', async (req, res) => {
  try {
    const workloadAnalysis = await scheduler.analyzeWorkloadPatterns();
    const optimizations = await scheduler.suggestOptimizations(workloadAnalysis);

    res.json({
      success: true,
      suggestions: optimizations,
      basedOn: 'workload_analysis',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors de la génération des suggestions:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la génération des suggestions',
      details: error.message
    });
  }
});

// === PLANIFICATION AVANCÉE ===

// Planifier les prochains jours
router.post('/plan', async (req, res) => {
  try {
    const { days = 7, mode = 'intelligent' } = req.body;

    logger.info(`Planification ${mode} demandée pour ${days} jours`);

    const planning = await scheduler.planUpcomingDays();

    res.json({
      success: true,
      planning,
      days: parseInt(days),
      mode,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors de la planification:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la planification',
      details: error.message
    });
  }
});

// Réorganiser les tâches
router.post('/reorganize', async (req, res) => {
  try {
    if (scheduler.isRunning) {
      return res.status(409).json({
        error: 'Réorganisation impossible',
        message: 'Une organisation est déjà en cours'
      });
    }

    logger.info('Réorganisation manuelle déclenchée via API');

    const startTime = Date.now();
    await scheduler.performIntelligentReorganization();
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      message: 'Réorganisation terminée avec succès',
      duration,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors de la réorganisation:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la réorganisation',
      details: error.message
    });
  }
});

// === CONFIGURATION ===

// Obtenir la configuration du scheduler
router.get('/config', (req, res) => {
  try {
    const config = require('../../config/config');

    const schedulerConfig = {
      dailyTime: config.scheduler.dailyTime,
      syncInterval: config.scheduler.syncInterval,
      maxDailyTasks: config.scheduler.maxDailyTasks,
      timezone: config.scheduler.timezone,
      priorities: config.priorities
    };

    res.json({
      success: true,
      config: schedulerConfig
    });

  } catch (error) {
    logger.error('Erreur lors de la récupération de la configuration:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la récupération de la configuration',
      details: error.message
    });
  }
});

// Mettre à jour la configuration des priorités (temporaire)
router.post('/config/priorities', (req, res) => {
  try {
    const { weights } = req.body;

    if (!weights || typeof weights !== 'object') {
      return res.status(400).json({
        error: 'Poids de priorité requis',
        field: 'weights'
      });
    }

    // Validation des poids
    const validKeys = ['complexityWeight', 'urgencyWeight', 'durationWeight', 'contextWeight'];
    const invalidKeys = Object.keys(weights).filter(key => !validKeys.includes(key));

    if (invalidKeys.length > 0) {
      return res.status(400).json({
        error: 'Clés de poids invalides',
        invalidKeys
      });
    }

    // Vérifier que la somme des poids est proche de 1
    const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(totalWeight - 1) > 0.1) {
      return res.status(400).json({
        error: 'La somme des poids doit être proche de 1',
        currentSum: totalWeight
      });
    }

    // Mettre à jour les poids dans le calculateur de priorité
    scheduler.priorityCalculator.updateWeights(weights);

    logger.info('Configuration des priorités mise à jour via API');

    res.json({
      success: true,
      message: 'Poids de priorité mis à jour',
      newWeights: weights
    });

  } catch (error) {
    logger.error('Erreur lors de la mise à jour des priorités:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la mise à jour des priorités',
      details: error.message
    });
  }
});

// === SANTÉ DU SYSTÈME ===

// Vérifier la santé du système de planification
router.get('/health', async (req, res) => {
  try {
    const health = await scheduler.checkSystemHealth();

    const overallStatus = health.overall ? 200 : 503;

    res.status(overallStatus).json({
      success: health.overall,
      health,
      scheduler: {
        running: !scheduler.isRunning,
        jobs: scheduler.scheduledJobs.size
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors de la vérification de santé:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la vérification de santé',
      details: error.message
    });
  }
});

// === NETTOYAGE CALENDRIER ===

// Lancer un nettoyage manuel du calendrier
router.post('/cleanup', async (req, res) => {
  try {
    logger.info('Nettoyage manuel du calendrier déclenché via API');

    const startTime = Date.now();
    const report = await scheduler.calendarCleaner.performCleanup();
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      message: 'Nettoyage terminé',
      report,
      duration,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors du nettoyage manuel:', error.message);
    res.status(500).json({
      error: 'Erreur lors du nettoyage',
      details: error.message
    });
  }
});

// Obtenir le rapport de santé du calendrier
router.get('/calendar/health', async (req, res) => {
  try {
    const healthReport = await scheduler.calendarCleaner.generateHealthReport();

    const statusCode = healthReport.isHealthy ? 200 : 503;

    res.status(statusCode).json({
      success: true,
      health: healthReport,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors de la génération du rapport de santé calendrier:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la génération du rapport',
      details: error.message
    });
  }
});

module.exports = router;
module.exports.scheduler = scheduler;
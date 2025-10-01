const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const config = require('../../config/config');

// Route de base pour l'API
router.get('/', (req, res) => {
  res.json({
    name: 'TickTick Orchestrator API',
    version: '1.0.0',
    description: 'API pour l\'orchestrateur intelligent TickTick',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/auth/*',
      tasks: '/api/tasks/*',
      calendar: '/api/calendar/*',
      scheduler: '/api/scheduler/*'
    },
    documentation: 'https://github.com/jeremy-polizzi/Ticktick-Orchestrator#api'
  });
});

// Informations système
router.get('/info', (req, res) => {
  res.json({
    success: true,
    system: {
      name: 'TickTick Orchestrator',
      version: '1.0.0',
      environment: config.server.env,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      platform: process.platform,
      node: process.version
    },
    features: {
      taskManagement: true,
      calendarSync: true,
      intelligentScheduling: true,
      naturalLanguageCommands: true,
      priorityCalculation: true,
      conflictResolution: true
    },
    integrations: {
      ticktick: 'OAuth2',
      googleCalendar: 'OAuth2'
    },
    timestamp: new Date().toISOString()
  });
});

// Statistiques globales
router.get('/stats', async (req, res) => {
  try {
    // Statistiques de base du processus
    const stats = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      timestamp: new Date().toISOString()
    };

    // Ajouter des statistiques des composants si disponibles
    try {
      const TaskManager = require('../../orchestrator/task-manager');
      const CalendarSync = require('../../orchestrator/calendar-sync');

      const taskManager = new TaskManager();
      const calendarSync = new CalendarSync();

      await taskManager.initialize();
      await calendarSync.initialize();

      // Statistiques des connexions
      const connections = await taskManager.checkConnections();
      const syncHealth = await calendarSync.checkSyncHealth();

      stats.connections = connections;
      stats.sync = {
        health: syncHealth,
        mappings: calendarSync.syncMap.size,
        lastSync: calendarSync.lastSyncTime
      };

    } catch (error) {
      logger.warn('Impossible de récupérer les statistiques avancées:', error.message);
      stats.warning = 'Statistiques avancées indisponibles';
    }

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    logger.error('Erreur lors de la récupération des statistiques:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la récupération des statistiques',
      details: error.message
    });
  }
});

// Santé globale du système
router.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: config.server.env,
      uptime: process.uptime()
    };

    // Vérifications de santé détaillées
    const checks = {
      memory: true,
      disk: true,
      apis: false,
      database: true
    };

    // Vérification mémoire
    const memUsage = process.memoryUsage();
    const memLimit = 1024 * 1024 * 1024; // 1GB limite
    checks.memory = memUsage.heapUsed < memLimit;

    // Vérification des APIs
    try {
      const TaskManager = require('../../orchestrator/task-manager');
      const taskManager = new TaskManager();
      await taskManager.initialize();
      const connections = await taskManager.checkConnections();
      checks.apis = connections.overall;
    } catch (error) {
      checks.apis = false;
    }

    health.checks = checks;
    health.overall = Object.values(checks).every(check => check === true);

    const statusCode = health.overall ? 200 : 503;

    res.status(statusCode).json({
      success: health.overall,
      health
    });

  } catch (error) {
    logger.error('Erreur lors de la vérification de santé:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification de santé',
      details: error.message
    });
  }
});

// Configuration publique (sans secrets)
router.get('/config', (req, res) => {
  res.json({
    success: true,
    config: {
      scheduler: {
        dailyTime: config.scheduler.dailyTime,
        maxDailyTasks: config.scheduler.maxDailyTasks,
        timezone: config.scheduler.timezone
      },
      priorities: config.priorities,
      features: {
        rateLimitWindow: config.security.rateLimitWindow,
        rateLimitMax: config.security.rateLimitMax
      }
    }
  });
});

// Logs récents (version limitée pour l'API)
router.get('/logs', (req, res) => {
  try {
    const { level = 'info', limit = 50 } = req.query;

    // Pour l'instant, retourner des logs basiques
    // Dans une vraie implémentation, on lirait les fichiers de logs
    const logs = {
      message: 'Logs disponibles via les fichiers de logs du serveur',
      logFiles: {
        main: config.logging.filePath,
        error: 'data/logs/error.log',
        actions: 'data/logs/actions.log'
      },
      level,
      limit: parseInt(limit)
    };

    res.json({
      success: true,
      logs
    });

  } catch (error) {
    logger.error('Erreur lors de la récupération des logs:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la récupération des logs',
      details: error.message
    });
  }
});

// Version et informations de build
router.get('/version', (req, res) => {
  res.json({
    success: true,
    version: {
      app: '1.0.0',
      api: '1.0.0',
      node: process.version,
      build: process.env.BUILD_NUMBER || 'dev',
      buildDate: process.env.BUILD_DATE || new Date().toISOString(),
      commit: process.env.GIT_COMMIT || 'unknown'
    }
  });
});

// Test de performance basique
router.get('/ping', (req, res) => {
  res.json({
    success: true,
    message: 'pong',
    timestamp: new Date().toISOString(),
    responseTime: Date.now() - req.startTime
  });
});

// Middleware pour mesurer le temps de réponse
router.use((req, res, next) => {
  req.startTime = Date.now();
  next();
});

// Endpoints de développement (uniquement en dev)
if (config.server.env === 'development') {

  // Forcer le garbage collection (dev seulement)
  router.post('/dev/gc', (req, res) => {
    if (global.gc) {
      global.gc();
      res.json({
        success: true,
        message: 'Garbage collection forcé',
        memory: process.memoryUsage()
      });
    } else {
      res.status(400).json({
        error: 'Garbage collection non disponible',
        hint: 'Démarrer Node.js avec --expose-gc'
      });
    }
  });

  // Informations de debugging
  router.get('/dev/debug', (req, res) => {
    res.json({
      success: true,
      debug: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        uptime: process.uptime(),
        environment: process.env,
        argv: process.argv,
        cwd: process.cwd(),
        platform: {
          arch: process.arch,
          platform: process.platform,
          version: process.version,
          versions: process.versions
        }
      }
    });
  });

  // Simuler des erreurs pour les tests
  router.post('/dev/error', (req, res) => {
    const { type = 'generic' } = req.body;

    switch (type) {
      case 'throw':
        throw new Error('Erreur de test générée');
      case 'async':
        setTimeout(() => {
          throw new Error('Erreur asynchrone de test');
        }, 100);
        res.json({ message: 'Erreur asynchrone programmée' });
        break;
      case 'memory':
        const bigArray = new Array(1000000).fill('test'.repeat(1000));
        res.json({ message: 'Allocation mémoire importante créée', size: bigArray.length });
        break;
      default:
        res.status(500).json({
          error: 'Erreur de test générique',
          type
        });
    }
  });
}

// Route catch-all pour les endpoints API non trouvés
router.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint API non trouvé',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      'GET /api/',
      'GET /api/info',
      'GET /api/stats',
      'GET /api/health',
      'GET /api/config',
      'GET /api/version',
      'GET /api/ping'
    ]
  });
});

module.exports = router;
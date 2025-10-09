const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');

// === DASHBOARD CAP NUMÉRIQUE ===

// Récupérer données dashboard depuis le scheduler
router.get('/cap-numerique', async (req, res) => {
  try {
    // Accéder au scheduler depuis l'app
    const scheduler = req.app.get('scheduler');

    if (!scheduler || !scheduler.smartOrchestrator) {
      return res.status(503).json({
        success: false,
        error: 'Smart Orchestrator non disponible'
      });
    }

    const dashboardData = await scheduler.smartOrchestrator.getDashboardData();

    res.json({
      success: true,
      dashboard: dashboardData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors de la récupération du dashboard Cap Numérique:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des données',
      details: error.message
    });
  }
});

// Forcer une analyse manuelle
router.post('/cap-numerique/analyze', async (req, res) => {
  try {
    const scheduler = req.app.get('scheduler');

    if (!scheduler || !scheduler.smartOrchestrator) {
      return res.status(503).json({
        success: false,
        error: 'Smart Orchestrator non disponible'
      });
    }

    logger.info('Analyse SmartOrchestrator déclenchée manuellement');

    const startTime = Date.now();
    const analysis = await scheduler.smartOrchestrator.performDailyAnalysis();
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      message: 'Analyse terminée',
      analysis,
      duration,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors de l\'analyse manuelle:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'analyse',
      details: error.message
    });
  }
});

// Récupérer suggestions
router.get('/cap-numerique/suggestions', async (req, res) => {
  try {
    const scheduler = req.app.get('scheduler');

    if (!scheduler || !scheduler.smartOrchestrator) {
      return res.status(503).json({
        success: false,
        error: 'Smart Orchestrator non disponible'
      });
    }

    const dashboardData = await scheduler.smartOrchestrator.getDashboardData();

    res.json({
      success: true,
      suggestions: dashboardData.suggestions,
      count: dashboardData.suggestions.length
    });

  } catch (error) {
    logger.error('Erreur lors de la récupération des suggestions:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération',
      details: error.message
    });
  }
});

module.exports = router;

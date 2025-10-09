const express = require('express');
const router = express.Router();
const CommandProcessor = require('../../orchestrator/command-processor');
const logger = require('../../utils/logger');

// Instance du processor
const commandProcessor = new CommandProcessor();

// Initialiser
commandProcessor.initialize().catch(error => {
  logger.error('Erreur lors de l\'initialisation du CommandProcessor:', error.message);
});

// === TRAITER COMMANDE ===

router.post('/execute', async (req, res) => {
  try {
    const { command } = req.body;

    if (!command || typeof command !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Commande requise',
        field: 'command'
      });
    }

    logger.info(`Commande reçue via API: "${command}"`);

    const result = await commandProcessor.processCommand(command);

    res.json({
      success: result.success,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors du traitement de la commande:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du traitement',
      details: error.message
    });
  }
});

// === HISTORIQUE ===

router.get('/history', (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const history = commandProcessor.getHistory(parseInt(limit));

    res.json({
      success: true,
      history,
      count: history.length
    });

  } catch (error) {
    logger.error('Erreur lors de la récupération de l\'historique:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération',
      details: error.message
    });
  }
});

// === AIDE ===

router.get('/help', (req, res) => {
  try {
    const helpText = commandProcessor.getHelpText();

    res.json({
      success: true,
      help: helpText
    });

  } catch (error) {
    logger.error('Erreur lors de la récupération de l\'aide:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération',
      details: error.message
    });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const IntelligentAgent = require('../../llm/intelligent-agent');
const logger = require('../../utils/logger');

// Instance globale de l'agent (singleton)
let agent = null;

// Initialiser l'agent au démarrage
async function initializeAgent() {
  if (!agent) {
    agent = new IntelligentAgent();
    await agent.initialize();
  }
  return agent;
}

/**
 * POST /api/llm/command
 *
 * Traite une commande en langage naturel
 *
 * Body: { message: "Relance tous les prospects >15j" }
 *
 * Response: {
 *   success: true,
 *   llmResponse: "Analyse LLM...",
 *   actions: [...],
 *   results: [...],
 *   summary: "✅ 3 actions réussies..."
 * }
 */
router.post('/command', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Message requis',
        example: { message: 'Relance tous les prospects >15j' }
      });
    }

    logger.info(`📨 Commande LLM reçue: "${message}"`);

    // Initialiser agent si pas déjà fait
    const llmAgent = await initializeAgent();

    // Traiter la commande
    const result = await llmAgent.processCommand(message);

    res.json(result);

  } catch (error) {
    logger.error('Erreur /api/llm/command:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/llm/status
 *
 * Vérifie si l'agent LLM est actif et fonctionnel
 */
router.get('/status', async (req, res) => {
  try {
    const isActive = agent !== null;
    const groqConfigured = !!process.env.GROQ_API_KEY;

    res.json({
      active: isActive,
      groqConfigured,
      model: 'llama-3.1-70b-versatile',
      provider: 'GROQ (gratuit)'
    });

  } catch (error) {
    logger.error('Erreur /api/llm/status:', error.message);
    res.status(500).json({
      error: error.message
    });
  }
});

module.exports = router;

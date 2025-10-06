const express = require('express');
const router = express.Router();
const TickTickAPI = require('../../api/ticktick-api');
const GoogleCalendarAPI = require('../../api/google-calendar-api');
const {
  generateAccessToken,
  verifyAdminPassword,
  authRateLimit
} = require('../middleware/auth');
const logger = require('../../utils/logger');

// Instances des APIs
const ticktickAPI = new TickTickAPI();
const googleAPI = new GoogleCalendarAPI();

// Login admin
router.post('/login', authRateLimit, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        error: 'Mot de passe requis',
        code: 'MISSING_PASSWORD'
      });
    }

    const isValid = await verifyAdminPassword(password);

    if (!isValid) {
      logger.warn(`Tentative de connexion échouée depuis ${req.ip}`);
      return res.status(401).json({
        error: 'Mot de passe incorrect',
        code: 'INVALID_PASSWORD'
      });
    }

    // Générer le token JWT
    const token = generateAccessToken({
      username: 'admin',
      role: 'admin',
      permissions: ['read', 'write', 'admin'],
      loginTime: new Date().toISOString()
    });

    logger.info(`Connexion admin réussie depuis ${req.ip}`);

    // Définir le token dans un cookie sécurisé HTTP-only
    res.cookie('token', token, {
      httpOnly: true,     // Empêche l'accès JavaScript côté client
      secure: true,       // Uniquement HTTPS
      sameSite: 'strict', // Protection CSRF
      maxAge: 24 * 60 * 60 * 1000, // 24 heures
      path: '/'           // Disponible sur tout le site
    });

    res.json({
      success: true,
      user: {
        username: 'admin',
        role: 'admin',
        permissions: ['read', 'write', 'admin']
      }
    });

  } catch (error) {
    logger.error('Erreur lors de la connexion:', error.message);
    res.status(500).json({
      error: 'Erreur interne du serveur',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Déconnexion
router.post('/logout', (req, res) => {
  // Supprimer le cookie sécurisé
  res.clearCookie('token', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/'
  });

  logger.info(`Déconnexion depuis ${req.ip}`);

  res.json({
    success: true,
    message: 'Déconnexion réussie'
  });
});

// Vérification du token
router.get('/verify', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1] || req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      valid: false,
      error: 'Token manquant'
    });
  }

  try {
    const jwt = require('jsonwebtoken');
    const config = require('../../config/config');

    const decoded = jwt.verify(token, config.security.jwtSecret);

    res.json({
      valid: true,
      user: {
        username: decoded.username,
        role: decoded.role,
        permissions: decoded.permissions
      }
    });
  } catch (error) {
    res.status(401).json({
      valid: false,
      error: 'Token invalide ou expiré'
    });
  }
});

// === AUTHENTIFICATION TICKTICK ===

// Démarrer l'authentification TickTick
router.get('/ticktick/start', async (req, res) => {
  try {
    const authUrl = ticktickAPI.getAuthUrl();

    logger.info('Redirection vers l\'authentification TickTick');

    // REDIRIGER directement au lieu de renvoyer du JSON
    res.redirect(authUrl);
  } catch (error) {
    logger.error('Erreur lors du démarrage de l\'auth TickTick:', error.message);
    res.status(500).json({
      error: 'Erreur lors de l\'initialisation de l\'authentification TickTick',
      code: 'TICKTICK_AUTH_ERROR'
    });
  }
});

// Callback TickTick
router.get('/ticktick/callback', async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error) {
      logger.error(`Erreur callback TickTick: ${error}`);
      return res.redirect('/?error=ticktick_auth_failed');
    }

    if (!code) {
      return res.redirect('/?error=missing_auth_code');
    }

    // Échanger le code contre des tokens
    const tokens = await ticktickAPI.exchangeCodeForToken(code);

    logger.info('Authentification TickTick réussie');

    // CRITIQUE: Forcer le rechargement des tokens dans le TaskManager global
    // Le TaskManager a été initialisé AVANT l'OAuth, il doit recharger les nouveaux tokens
    const TaskManager = require('../../orchestrator/task-manager');
    const taskManager = require('../../web/routes/tasks').taskManager;
    if (taskManager && taskManager.ticktick) {
      await taskManager.ticktick.loadTokens();
      logger.info('Tokens TickTick rechargés dans le TaskManager après OAuth');
    }

    // Rediriger vers le dashboard avec succès (préserve la session admin)
    res.redirect('/dashboard?ticktick_auth=success');

  } catch (error) {
    logger.error('Erreur lors du callback TickTick:', error.message);
    res.redirect('/?error=ticktick_callback_failed');
  }
});

// Statut de l'authentification TickTick
router.get('/ticktick/status', async (req, res) => {
  try {
    await ticktickAPI.loadTokens();
    const isConnected = await ticktickAPI.checkConnection();

    res.json({
      connected: isConnected,
      lastCheck: new Date().toISOString()
    });
  } catch (error) {
    res.json({
      connected: false,
      error: error.message,
      lastCheck: new Date().toISOString()
    });
  }
});

// === AUTHENTIFICATION GOOGLE CALENDAR ===

// Démarrer l'authentification Google
router.get('/google/start', async (req, res) => {
  try {
    const authUrl = googleAPI.getAuthUrl();

    logger.info('Redirection vers l\'authentification Google');

    // REDIRIGER directement au lieu de renvoyer du JSON
    res.redirect(authUrl);
  } catch (error) {
    logger.error('Erreur lors du démarrage de l\'auth Google:', error.message);
    res.status(500).json({
      error: 'Erreur lors de l\'initialisation de l\'authentification Google',
      code: 'GOOGLE_AUTH_ERROR'
    });
  }
});

// Callback Google
router.get('/google/callback', async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error) {
      logger.error(`Erreur callback Google: ${error}`);
      return res.redirect('/?error=google_auth_failed');
    }

    if (!code) {
      return res.redirect('/?error=missing_auth_code');
    }

    // Échanger le code contre des tokens
    const tokens = await googleAPI.exchangeCodeForToken(code);

    logger.info('Authentification Google réussie');

    // Rediriger vers le dashboard avec succès (préserve la session admin)
    res.redirect('/dashboard?google_auth=success');

  } catch (error) {
    logger.error('Erreur lors du callback Google:', error.message);
    res.redirect('/?error=google_callback_failed');
  }
});

// Statut de l'authentification Google
router.get('/google/status', async (req, res) => {
  try {
    await googleAPI.loadTokens();
    const isConnected = await googleAPI.checkConnection();

    res.json({
      connected: isConnected,
      lastCheck: new Date().toISOString()
    });
  } catch (error) {
    res.json({
      connected: false,
      error: error.message,
      lastCheck: new Date().toISOString()
    });
  }
});

// === STATUT GLOBAL ===

// Statut de toutes les authentifications
router.get('/status', async (req, res) => {
  try {
    const [ticktickStatus, googleStatus] = await Promise.allSettled([
      (async () => {
        await ticktickAPI.loadTokens();
        return await ticktickAPI.checkConnection();
      })(),
      (async () => {
        await googleAPI.loadTokens();
        return await googleAPI.checkConnection();
      })()
    ]);

    const status = {
      ticktick: {
        connected: ticktickStatus.status === 'fulfilled' ? ticktickStatus.value : false,
        error: ticktickStatus.status === 'rejected' ? ticktickStatus.reason.message : null
      },
      google: {
        connected: googleStatus.status === 'fulfilled' ? googleStatus.value : false,
        error: googleStatus.status === 'rejected' ? googleStatus.reason.message : null
      },
      overall: false,
      timestamp: new Date().toISOString()
    };

    status.overall = status.ticktick.connected && status.google.connected;

    res.json(status);
  } catch (error) {
    logger.error('Erreur lors de la vérification du statut global:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la vérification du statut',
      code: 'STATUS_CHECK_ERROR'
    });
  }
});

// === RÉINITIALISATION ===

// Réinitialiser l'authentification TickTick
router.post('/ticktick/reset', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const config = require('../../config/config');

    const tokensPath = path.join(config.paths.tokens, 'ticktick_tokens.json');

    try {
      await fs.unlink(tokensPath);
      logger.info('Tokens TickTick supprimés');
    } catch (error) {
      // Fichier déjà inexistant
    }

    // Réinitialiser l'instance API
    ticktickAPI.accessToken = null;
    ticktickAPI.refreshToken = null;

    res.json({
      success: true,
      message: 'Authentification TickTick réinitialisée'
    });
  } catch (error) {
    logger.error('Erreur lors de la réinitialisation TickTick:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la réinitialisation',
      code: 'RESET_ERROR'
    });
  }
});

// Réinitialiser l'authentification Google
router.post('/google/reset', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const config = require('../../config/config');

    const tokensPath = path.join(config.paths.tokens, 'google_tokens.json');

    try {
      await fs.unlink(tokensPath);
      logger.info('Tokens Google supprimés');
    } catch (error) {
      // Fichier déjà inexistant
    }

    // Réinitialiser l'instance API
    googleAPI.oauth2Client.setCredentials({});

    res.json({
      success: true,
      message: 'Authentification Google réinitialisée'
    });
  } catch (error) {
    logger.error('Erreur lors de la réinitialisation Google:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la réinitialisation',
      code: 'RESET_ERROR'
    });
  }
});

module.exports = router;
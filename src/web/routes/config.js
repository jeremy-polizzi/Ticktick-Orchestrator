const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const config = require('../../config/config');
const logger = require('../../utils/logger');

const CONFIG_FILE = path.join(__dirname, '../../../.env');

// Instances singleton pour éviter les fuites mémoire
const TickTickAPI = require('../../api/ticktick-api');
const GoogleCalendarAPI = require('../../api/google-calendar-api');
const ticktickAPI = new TickTickAPI();
const googleAPI = new GoogleCalendarAPI();

// Lire la configuration actuelle
router.get('/current', async (req, res) => {
  try {
    const currentConfig = {
      server: {
        port: config.server.port,
        env: config.server.env
      },
      ticktick: {
        clientId: config.ticktick.clientId || null,
        clientIdMasked: config.ticktick.clientId ? '***configured***' : null,
        redirectUri: config.getTickTickRedirectUri(req)
      },
      google: {
        clientId: config.google.clientId || null,
        clientIdMasked: config.google.clientId ? '***configured***' : null,
        redirectUri: config.getGoogleRedirectUri(req)
      },
      calendar: {
        jeremyCalendarId: config.calendars.jeremy,
        businessCalendarId: config.calendars.business
      },
      scheduler: {
        dailyTime: config.scheduler.dailyTime,
        syncInterval: config.scheduler.syncInterval,
        maxDailyTasks: config.scheduler.maxDailyTasks
      },
      database: {
        path: config.database.path
      }
    };

    res.json({
      success: true,
      config: currentConfig
    });
  } catch (error) {
    logger.error('Erreur lecture configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lecture configuration'
    });
  }
});

// Sauvegarder la configuration
router.post('/save', async (req, res) => {
  try {
    const {
      ticktickClientId,
      ticktickClientSecret,
      googleClientId,
      googleClientSecret,
      jeremyCalendarId,
      businessCalendarId,
      jwtSecret,
      adminPassword,
      dailyTime,
      syncInterval,
      maxDailyTasks
    } = req.body;

    // Lire le fichier .env actuel
    let envContent = '';
    try {
      envContent = await fs.readFile(CONFIG_FILE, 'utf8');
    } catch (error) {
      logger.warn('.env file not found, creating new one');
    }

    // Fonction pour mettre à jour ou ajouter une variable
    const updateEnvVar = (content, key, value) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(content)) {
        return content.replace(regex, `${key}=${value}`);
      } else {
        return content + `\n${key}=${value}`;
      }
    };

    // Mettre à jour les variables (conserver les secrets existants si champs vides)
    if (ticktickClientId) {
      envContent = updateEnvVar(envContent, 'TICKTICK_CLIENT_ID', ticktickClientId);
    }
    if (ticktickClientSecret && ticktickClientSecret.trim() !== '') {
      envContent = updateEnvVar(envContent, 'TICKTICK_CLIENT_SECRET', ticktickClientSecret);
    }
    if (googleClientId) {
      envContent = updateEnvVar(envContent, 'GOOGLE_CLIENT_ID', googleClientId);
    }
    if (googleClientSecret && googleClientSecret.trim() !== '') {
      envContent = updateEnvVar(envContent, 'GOOGLE_CLIENT_SECRET', googleClientSecret);
    }
    if (jeremyCalendarId) {
      envContent = updateEnvVar(envContent, 'JEREMY_CALENDAR_ID', jeremyCalendarId);
    }
    if (businessCalendarId) {
      envContent = updateEnvVar(envContent, 'BUSINESS_CALENDAR_ID', businessCalendarId);
    }
    if (jwtSecret) {
      envContent = updateEnvVar(envContent, 'JWT_SECRET', jwtSecret);
    }
    if (adminPassword) {
      envContent = updateEnvVar(envContent, 'ADMIN_PASSWORD', adminPassword);
    }

    // Paramètres du scheduler
    if (dailyTime) {
      envContent = updateEnvVar(envContent, 'DAILY_SCHEDULER_TIME', dailyTime);
    }
    if (syncInterval !== undefined && syncInterval !== null) {
      envContent = updateEnvVar(envContent, 'SYNC_INTERVAL_MINUTES', syncInterval.toString());
    }
    if (maxDailyTasks !== undefined && maxDailyTasks !== null) {
      envContent = updateEnvVar(envContent, 'MAX_DAILY_TASKS', maxDailyTasks.toString());
    }

    // Sauvegarder le fichier
    await fs.writeFile(CONFIG_FILE, envContent.trim() + '\n');

    logger.info('Configuration sauvegardée avec succès');

    // Recharger immédiatement la configuration en mémoire
    // 1. FORCER dotenv à relire le fichier .env
    delete require.cache[require.resolve('dotenv')];
    require('dotenv').config({ path: CONFIG_FILE, override: true });

    // 2. Purger le cache du module config
    delete require.cache[require.resolve('../../config/config')];
    const newConfig = require('../../config/config');

    // 3. Mettre à jour l'objet config actif
    Object.assign(config, newConfig);

    logger.info(`Configuration rechargée en mémoire - scheduler: ${newConfig.scheduler.dailyTime}, ${newConfig.scheduler.syncInterval}min, ${newConfig.scheduler.maxDailyTasks} tâches/jour`);

    // Mettre à jour le scheduler si disponible
    const scheduler = req.app.get('scheduler');
    const schedulerParamsChanged = dailyTime || syncInterval !== undefined || maxDailyTasks !== undefined;
    const oauthParamsChanged = ticktickClientId || ticktickClientSecret || googleClientId || googleClientSecret;

    if (scheduler && schedulerParamsChanged) {
      // Arrêter les jobs actuels
      const wasRunning = scheduler.scheduledJobs && scheduler.scheduledJobs.size > 0;
      if (wasRunning) {
        scheduler.stopScheduler();
        logger.info('Scheduler arrêté pour mise à jour paramètres');
      }

      // Redémarrer avec les nouvelles valeurs (automatiquement via config rechargé)
      setTimeout(() => {
        scheduler.startScheduler();
        logger.info(`✅ Scheduler redémarré avec nouveaux paramètres: dailyTime=${newConfig.scheduler.dailyTime}, syncInterval=${newConfig.scheduler.syncInterval}min, maxDailyTasks=${newConfig.scheduler.maxDailyTasks}`);
      }, 500);
    }

    // Redémarrage serveur uniquement si credentials OAuth modifiés
    if (oauthParamsChanged) {
      logger.info('⚡ Redémarrage automatique du serveur pour appliquer les changements OAuth...');

      res.json({
        success: true,
        message: 'Configuration sauvegardée. Redémarrage automatique en cours pour appliquer les credentials OAuth...',
        willRestart: true
      });

      // Redémarrer après 2 secondes pour laisser le temps à la réponse
      setTimeout(() => {
        const { exec } = require('child_process');
        const restartScript = path.join(__dirname, '../../../restart.sh');
        exec(restartScript, (error) => {
          if (error) {
            logger.error('Erreur redémarrage:', error);
          }
        });
      }, 2000);
    } else {
      // Pas de redémarrage nécessaire, juste confirmation
      res.json({
        success: true,
        message: schedulerParamsChanged
          ? 'Paramètres du scheduler sauvegardés et appliqués immédiatement'
          : 'Configuration sauvegardée avec succès',
        willRestart: false,
        schedulerRestarted: schedulerParamsChanged
      });
    }

  } catch (error) {
    logger.error('Erreur sauvegarde configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la sauvegarde'
    });
  }
});

// Test de connexion TickTick
router.post('/test/ticktick', async (req, res) => {
  try {
    const { clientId, clientSecret } = req.body;

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        error: 'Client ID et Client Secret requis'
      });
    }

    // Test basique de la configuration TickTick
    // Créer une URL d'autorisation avec les nouveaux credentials
    const authUrl = `https://ticktick.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${config.ticktick.redirectUri}&scope=tasks:write tasks:read`;

    // Validation simple du format
    if (!clientId.match(/^[a-zA-Z0-9_-]+$/)) {
      throw new Error('Format Client ID invalide');
    }

    res.json({
      success: true,
      message: 'Configuration TickTick valide',
      authUrl: authUrl
    });

  } catch (error) {
    logger.error('Erreur test TickTick:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du test TickTick: ' + error.message
    });
  }
});

// Test de connexion Google Calendar
router.post('/test/google', async (req, res) => {
  try {
    const { clientId, clientSecret } = req.body;

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        error: 'Client ID et Client Secret requis'
      });
    }

    // Test basique de la configuration Google
    // Créer une URL d'autorisation avec les nouveaux credentials
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=code&redirect_uri=${config.google.redirectUri}&scope=https://www.googleapis.com/auth/calendar&access_type=offline`;

    // Validation simple du format Google Client ID
    if (!clientId.includes('.googleusercontent.com')) {
      throw new Error('Format Google Client ID invalide (doit finir par .googleusercontent.com)');
    }

    res.json({
      success: true,
      message: 'Configuration Google Calendar valide',
      authUrl: authUrl
    });

  } catch (error) {
    logger.error('Erreur test Google:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du test Google Calendar: ' + error.message
    });
  }
});

// Autorisation TickTick
router.get('/auth/ticktick', async (req, res) => {
  try {
    // Utiliser la configuration actuelle du .env
    const authUrl = `https://ticktick.com/oauth/authorize?client_id=${config.ticktick.clientId}&response_type=code&redirect_uri=${config.ticktick.redirectUri}&scope=tasks:write tasks:read`;

    if (!config.ticktick.clientId || config.ticktick.clientId === 'your-ticktick-client-id') {
      throw new Error('TickTick Client ID non configuré');
    }

    res.redirect(authUrl);

  } catch (error) {
    logger.error('Erreur autorisation TickTick:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'autorisation TickTick'
    });
  }
});

// ⚠️ CALLBACK SUPPRIMÉ - Utilisez /auth/ticktick/callback dans auth.js
// Ce fichier (config.js) ne gère QUE la configuration, pas l'OAuth

// Autorisation Google Calendar
router.get('/auth/google', async (req, res) => {
  try {
    // Utiliser la configuration actuelle du .env
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${config.google.clientId}&response_type=code&redirect_uri=${config.google.redirectUri}&scope=https://www.googleapis.com/auth/calendar&access_type=offline`;

    if (!config.google.clientId || config.google.clientId === 'your-google-client-id') {
      throw new Error('Google Client ID non configuré');
    }

    res.redirect(authUrl);

  } catch (error) {
    logger.error('Erreur autorisation Google:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'autorisation Google'
    });
  }
});

// Callback Google Calendar
router.get('/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Code d\'autorisation manquant'
      });
    }

    // Échanger le code contre un token
    const tokens = await googleAPI.exchangeCodeForTokens(code);

    // Sauvegarder les tokens
    await googleAPI.saveTokens(tokens);

    logger.info('Autorisation Google Calendar réussie');

    // Rediriger vers l'interface avec succès
    res.redirect('/?config=success&service=google');

  } catch (error) {
    logger.error('Erreur callback Google:', error);
    res.redirect('/?config=error&service=google&error=' + encodeURIComponent(error.message));
  }
});

// Status des connexions
router.get('/status', async (req, res) => {
  try {
    const status = {
      ticktick: {
        configured: !!config.ticktick.clientId,
        connected: false
      },
      google: {
        configured: !!config.google.clientId,
        connected: false
      }
    };

    // Vérifier les tokens TickTick
    try {
      const hasTokens = await ticktickAPI.hasValidTokens();
      status.ticktick.connected = hasTokens;
    } catch (error) {
      logger.debug('TickTick non connecté:', error.message);
    }

    // Vérifier les tokens Google
    try {
      const hasTokens = await googleAPI.hasValidTokens();
      status.google.connected = hasTokens;
    } catch (error) {
      logger.debug('Google non connecté:', error.message);
    }

    res.json({
      success: true,
      status: status
    });

  } catch (error) {
    logger.error('Erreur status:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification du status'
    });
  }
});

module.exports = router;
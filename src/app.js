const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const config = require('./config/config');
const logger = require('./utils/logger');

// Routes
const authRoutes = require('./web/routes/auth');
const taskRoutes = require('./web/routes/tasks');
const calendarRoutes = require('./web/routes/calendar');
const schedulerRoutes = require('./web/routes/scheduler');
const apiRoutes = require('./web/routes/api');

// Middleware d'authentification
const { authenticateToken } = require('./web/middleware/auth');

class OrchestratorApp {
  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Sécurité
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https://api.ticktick.com", "https://www.googleapis.com"]
        }
      }
    }));

    // CORS
    this.app.use(cors({
      origin: config.server.env === 'development' ? '*' : false,
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.security.rateLimitWindow,
      max: config.security.rateLimitMax,
      message: {
        error: 'Trop de requêtes, veuillez réessayer plus tard'
      }
    });
    this.app.use('/api', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Static files
    this.app.use(express.static(path.join(__dirname, 'web/public')));

    // Logging des requêtes
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  setupRoutes() {
    // Routes d'authentification (publiques)
    this.app.use('/auth', authRoutes);

    // Interface web (publique pour la page de login)
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'web/public/index.html'));
    });

    // Health check (public)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: config.server.env
      });
    });

    // Routes API protégées
    this.app.use('/api/tasks', authenticateToken, taskRoutes);
    this.app.use('/api/calendar', authenticateToken, calendarRoutes);
    this.app.use('/api/scheduler', authenticateToken, schedulerRoutes);
    this.app.use('/api', authenticateToken, apiRoutes);

    // Route catch-all pour SPA
    this.app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Endpoint non trouvé' });
      }
      res.sendFile(path.join(__dirname, 'web/public/index.html'));
    });
  }

  setupErrorHandling() {
    // Gestionnaire d'erreurs 404
    this.app.use((req, res, next) => {
      res.status(404).json({
        error: 'Ressource non trouvée',
        path: req.path,
        method: req.method
      });
    });

    // Gestionnaire d'erreurs global
    this.app.use((error, req, res, next) => {
      logger.error('Erreur non gérée:', error);

      // Ne pas exposer les détails en production
      const isDevelopment = config.server.env === 'development';

      res.status(error.status || 500).json({
        error: isDevelopment ? error.message : 'Erreur interne du serveur',
        ...(isDevelopment && { stack: error.stack }),
        timestamp: new Date().toISOString(),
        path: req.path
      });
    });
  }

  async start() {
    try {
      const port = config.server.port;

      // Vérifier la configuration
      if (config.server.env === 'production') {
        this.validateProductionConfig();
      }

      // Démarrer le serveur
      this.server = this.app.listen(port, () => {
        logger.info(`🚀 TickTick Orchestrator démarré sur le port ${port}`);
        logger.info(`🌐 Interface web: http://localhost:${port}`);
        logger.info(`📋 API: http://localhost:${port}/api`);
        logger.info(`🔧 Environnement: ${config.server.env}`);
      });

      // Gestion propre de l'arrêt
      process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));

      return this.server;
    } catch (error) {
      logger.error('Erreur lors du démarrage du serveur:', error.message);
      throw error;
    }
  }

  validateProductionConfig() {
    const required = [
      'TICKTICK_CLIENT_ID',
      'TICKTICK_CLIENT_SECRET',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'JWT_SECRET'
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Variables d'environnement manquantes en production: ${missing.join(', ')}`);
    }

    if (config.security.jwtSecret === 'default-secret-change-in-production') {
      throw new Error('JWT_SECRET doit être changé en production');
    }

    if (config.security.adminPassword === 'admin123') {
      throw new Error('ADMIN_PASSWORD doit être changé en production');
    }
  }

  async gracefulShutdown(signal) {
    logger.info(`Signal ${signal} reçu, arrêt en cours...`);

    // Fermer le serveur HTTP
    if (this.server) {
      this.server.close(() => {
        logger.info('Serveur HTTP fermé');
      });
    }

    // Donner du temps pour terminer les requêtes en cours
    setTimeout(() => {
      logger.info('Arrêt forcé');
      process.exit(0);
    }, 10000);
  }

  // Méthodes utilitaires pour les tests
  getApp() {
    return this.app;
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(resolve);
      });
    }
  }
}

// Démarrage automatique si exécuté directement
if (require.main === module) {
  const app = new OrchestratorApp();

  app.start().catch(error => {
    logger.error('Erreur fatale:', error.message);
    process.exit(1);
  });
}

module.exports = OrchestratorApp;
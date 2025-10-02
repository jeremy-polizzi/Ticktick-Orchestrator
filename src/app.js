const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const https = require('https');
const http = require('http');
const fs = require('fs');

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

    // Logging des requêtes
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  setupRoutes() {
    // Routes d'authentification (publiques)
    this.app.use('/auth', authRoutes);

    // Routes de configuration (protégées)
    const configRoutes = require('./web/routes/config');
    this.app.use('/api/config', authenticateToken, configRoutes);

    // Interface web (PROTÉGÉE - redirection vers login si non authentifié)
    this.app.get('/', (req, res) => {
      // Toujours rediriger vers login - l'authentification se fait côté client
      res.redirect('/login');
    });

    // Page de login (publique)
    this.app.get('/login', (req, res) => {
      res.sendFile(path.join(__dirname, 'web/public/login.html'));
    });

    // Dashboard (protégé)
    this.app.get('/dashboard', (req, res) => {
      // Vérifier si l'utilisateur est authentifié
      const token = req.headers.authorization?.split(' ')[1] || req.query.token;

      if (!token) {
        return res.redirect('/login');
      }

      // Vérifier la validité du token
      const jwt = require('jsonwebtoken');
      const config = require('./config/config');

      try {
        jwt.verify(token, config.security.jwtSecret);
        res.sendFile(path.join(__dirname, 'web/public/index.html'));
      } catch (error) {
        res.redirect('/login?error=expired');
      }
    });

    // Page de configuration (protégée)
    this.app.get('/config', (req, res) => {
      // Vérifier si l'utilisateur est authentifié
      const token = req.headers.authorization?.split(' ')[1] || req.query.token;

      if (!token) {
        return res.redirect('/login');
      }

      // Vérifier la validité du token
      const jwt = require('jsonwebtoken');
      const config = require('./config/config');

      try {
        jwt.verify(token, config.security.jwtSecret);
        res.sendFile(path.join(__dirname, 'web/public/config.html'));
      } catch (error) {
        res.redirect('/login');
      }
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

    // Fichiers statiques publics (uniquement CSS, JS, images)
    this.app.use('/css', express.static(path.join(__dirname, 'web/public/css')));
    this.app.use('/js', express.static(path.join(__dirname, 'web/public/js')));
    this.app.use('/img', express.static(path.join(__dirname, 'web/public/img')));
    this.app.use('/assets', express.static(path.join(__dirname, 'web/public/assets')));

    // Servir les fichiers JS/CSS de l'app seulement
    this.app.get('/app.js', (req, res) => {
      res.sendFile(path.join(__dirname, 'web/public/app.js'));
    });
    this.app.get('/config.js', (req, res) => {
      res.sendFile(path.join(__dirname, 'web/public/config.js'));
    });

    // Routes API protégées
    this.app.use('/api/tasks', authenticateToken, taskRoutes);
    this.app.use('/api/calendar', authenticateToken, calendarRoutes);
    this.app.use('/api/scheduler', authenticateToken, schedulerRoutes);
    this.app.use('/api', authenticateToken, apiRoutes);

    // Route catch-all - rediriger vers login
    this.app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Endpoint non trouvé' });
      }
      // Toutes les autres routes redirigent vers login
      res.redirect('/login');
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
      const httpsPort = config.server.httpsPort;

      // Vérifier la configuration
      if (config.server.env === 'production') {
        this.validateProductionConfig();
      }

      // Serveur HTTP (redirection vers HTTPS)
      const httpApp = express();
      httpApp.use((req, res) => {
        const httpsUrl = `https://${req.headers.host.replace(/:\d+$/, '')}:${httpsPort}${req.url}`;
        res.redirect(301, httpsUrl);
      });

      this.httpServer = http.createServer(httpApp);
      this.httpServer.listen(port, () => {
        logger.info(`🔄 Serveur HTTP démarré sur le port ${port} (redirection HTTPS)`);
      });

      // Serveur HTTPS
      try {
        const sslOptions = {
          key: fs.readFileSync(path.join(__dirname, '..', config.server.sslKeyPath)),
          cert: fs.readFileSync(path.join(__dirname, '..', config.server.sslCertPath))
        };

        this.httpsServer = https.createServer(sslOptions, this.app);
        this.httpsServer.listen(httpsPort, () => {
          logger.info(`🚀 TickTick Orchestrator démarré sur le port HTTPS ${httpsPort}`);
          logger.info(`🌐 Interface web: https://localhost:${httpsPort}`);
          logger.info(`📋 API: https://localhost:${httpsPort}/api`);
          logger.info(`🔧 Environnement: ${config.server.env}`);
          logger.info(`🔒 SSL activé avec certificat auto-signé`);
        });

        this.server = this.httpsServer;
      } catch (sslError) {
        logger.warn('Certificats SSL non trouvés, démarrage HTTP uniquement:', sslError.message);

        // Fallback vers HTTP si SSL échoue
        this.server = this.app.listen(port, () => {
          logger.info(`🚀 TickTick Orchestrator démarré sur le port ${port} (HTTP uniquement)`);
          logger.info(`🌐 Interface web: http://localhost:${port}`);
          logger.info(`📋 API: http://localhost:${port}/api`);
          logger.info(`🔧 Environnement: ${config.server.env}`);
        });
      }

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

    // Fermer les serveurs HTTP et HTTPS
    const promises = [];

    if (this.httpServer) {
      promises.push(new Promise((resolve) => {
        this.httpServer.close(() => {
          logger.info('Serveur HTTP fermé');
          resolve();
        });
      }));
    }

    if (this.httpsServer) {
      promises.push(new Promise((resolve) => {
        this.httpsServer.close(() => {
          logger.info('Serveur HTTPS fermé');
          resolve();
        });
      }));
    }

    if (this.server && this.server !== this.httpsServer) {
      promises.push(new Promise((resolve) => {
        this.server.close(() => {
          logger.info('Serveur principal fermé');
          resolve();
        });
      }));
    }

    // Attendre que tous les serveurs se ferment
    try {
      await Promise.all(promises);
      logger.info('Tous les serveurs fermés proprement');
      process.exit(0);
    } catch (error) {
      logger.error('Erreur lors de la fermeture:', error);
      setTimeout(() => {
        logger.info('Arrêt forcé');
        process.exit(0);
      }, 5000);
    }
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
const path = require('path');
require('dotenv').config();

const config = {
  // Server configuration
  server: {
    port: parseInt(process.env.PORT) || 3000,
    httpsPort: parseInt(process.env.HTTPS_PORT) || 3443,
    env: process.env.NODE_ENV || 'development',
    sslCertPath: process.env.SSL_CERT_PATH || './ssl/server.cert',
    sslKeyPath: process.env.SSL_KEY_PATH || './ssl/server.key'
  },

  // Security
  security: {
    jwtSecret: process.env.JWT_SECRET || 'default-secret-change-in-production',
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 min
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  },

  // TickTick API
  ticktick: {
    clientId: process.env.TICKTICK_CLIENT_ID,
    clientSecret: process.env.TICKTICK_CLIENT_SECRET,
    redirectUri: process.env.TICKTICK_REDIRECT_URI, // Sera auto-détecté si vide
    baseUrl: 'https://api.ticktick.com',
    authBaseUrl: 'https://ticktick.com', // OAuth endpoints sur ticktick.com, pas api.ticktick.com
    scope: 'tasks:write tasks:read'
  },

  // Google Calendar API
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI, // Sera auto-détecté si vide
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ]
  },

  // Détection automatique du domaine/IP pour les redirect URIs
  getBaseUrl: function(req) {
    // Si les redirect URIs sont définis dans .env, les utiliser
    if (this.ticktick.redirectUri && this.google.redirectUri) {
      return null; // Pas besoin de générer dynamiquement
    }

    // Sinon, détecter automatiquement depuis la requête
    const protocol = req.protocol || (req.headers['x-forwarded-proto'] || 'http');
    const host = req.get('host') || req.headers['x-forwarded-host'] || 'localhost:3000';

    return `${protocol}://${host}`;
  },

  getTickTickRedirectUri: function(req) {
    if (this.ticktick.redirectUri) {
      return this.ticktick.redirectUri;
    }
    const baseUrl = this.getBaseUrl(req);
    return `${baseUrl}/auth/ticktick/callback`;
  },

  getGoogleRedirectUri: function(req) {
    if (this.google.redirectUri) {
      return this.google.redirectUri;
    }
    const baseUrl = this.getBaseUrl(req);
    return `${baseUrl}/auth/google/callback`;
  },

  // Database
  database: {
    path: process.env.DATABASE_PATH || path.join(__dirname, '../../data/orchestrator.db')
  },

  // Scheduling
  scheduler: {
    dailyTime: process.env.DAILY_SCHEDULER_TIME || '06:00',
    syncInterval: parseInt(process.env.SYNC_INTERVAL_MINUTES) || 30,
    maxDailyTasks: parseInt(process.env.MAX_DAILY_TASKS) || 3,
    timezone: 'Europe/Paris'
  },

  // Calendars
  calendars: {
    jeremy: process.env.JEREMY_CALENDAR_ID || 'jeremy.polizzie@gmail.com',
    business: process.env.BUSINESS_CALENDAR_ID || 'plusdeclients@gmail.com'
  },

  // Task Priority Weights
  priorities: {
    complexityWeight: parseFloat(process.env.COMPLEXITY_WEIGHT) || 0.4,
    urgencyWeight: parseFloat(process.env.URGENCY_WEIGHT) || 0.3,
    durationWeight: parseFloat(process.env.DURATION_WEIGHT) || 0.2,
    contextWeight: parseFloat(process.env.CONTEXT_WEIGHT) || 0.1
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || path.join(__dirname, '../../data/logs/orchestrator.log')
  },

  // Paths
  paths: {
    data: path.join(__dirname, '../../data'),
    logs: path.join(__dirname, '../../data/logs'),
    backup: path.join(__dirname, '../../data/backup'),
    tokens: path.join(__dirname, '../../data/tokens')
  }
};

// Validation des variables d'environnement critiques
function validateConfig() {
  const required = [
    'TICKTICK_CLIENT_ID',
    'TICKTICK_CLIENT_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0 && config.server.env === 'production') {
    throw new Error(`Variables d'environnement manquantes: ${missing.join(', ')}`);
  }
}

// Créer les répertoires nécessaires
function ensureDirectories() {
  const fs = require('fs');
  const dirs = [
    config.paths.data,
    config.paths.logs,
    config.paths.backup,
    config.paths.tokens
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// Initialisation
if (config.server.env === 'production') {
  validateConfig();
}
ensureDirectories();

module.exports = config;
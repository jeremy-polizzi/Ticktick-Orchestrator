const winston = require('winston');
const path = require('path');
const config = require('../config/config');

// Créer le répertoire de logs s'il n'existe pas
const fs = require('fs');
if (!fs.existsSync(config.paths.logs)) {
  fs.mkdirSync(config.paths.logs, { recursive: true });
}

// Format personnalisé pour les logs
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    if (stack) {
      return `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`;
    }
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
  })
);

// Configuration du logger
const logger = winston.createLogger({
  level: config.logging.level,
  format: customFormat,
  defaultMeta: { service: 'ticktick-orchestrator' },
  transports: [
    // Fichier pour tous les logs
    new winston.transports.File({
      filename: config.logging.filePath,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),

    // Fichier séparé pour les erreurs
    new winston.transports.File({
      filename: path.join(config.paths.logs, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 3
    }),

    // Fichier pour les actions importantes
    new winston.transports.File({
      filename: path.join(config.paths.logs, 'actions.log'),
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

// En développement, ajouter console
if (config.server.env !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Méthodes utilitaires pour les logs d'actions
logger.logAction = function(action, details = {}) {
  this.info('ACTION', {
    action,
    timestamp: new Date().toISOString(),
    details
  });
};

logger.logTaskAction = function(action, taskData, result = null) {
  this.info('TASK_ACTION', {
    action,
    task: {
      id: taskData.id,
      title: taskData.title,
      projectId: taskData.projectId
    },
    result,
    timestamp: new Date().toISOString()
  });
};

logger.logSchedulerAction = function(action, details = {}) {
  this.info('SCHEDULER', {
    action,
    timestamp: new Date().toISOString(),
    details
  });
};

logger.logSyncAction = function(source, target, details = {}) {
  this.info('SYNC', {
    source,
    target,
    timestamp: new Date().toISOString(),
    details
  });
};

logger.logAPICall = function(api, method, endpoint, status = 'success') {
  this.info('API_CALL', {
    api,
    method,
    endpoint,
    status,
    timestamp: new Date().toISOString()
  });
};

logger.logPerformance = function(operation, duration, details = {}) {
  this.info('PERFORMANCE', {
    operation,
    duration,
    timestamp: new Date().toISOString(),
    details
  });
};

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = logger;
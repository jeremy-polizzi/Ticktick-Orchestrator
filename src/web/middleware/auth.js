const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../../config/config');
const logger = require('../../utils/logger');

// Middleware d'authentification JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1] || req.cookies?.token; // Vérifier Bearer token OU cookie

  if (!token) {
    return res.status(401).json({
      error: 'Token d\'accès requis',
      code: 'MISSING_TOKEN'
    });
  }

  jwt.verify(token, config.security.jwtSecret, (err, user) => {
    if (err) {
      logger.warn(`Tentative d'accès avec token invalide: ${req.ip}`);
      return res.status(403).json({
        error: 'Token invalide ou expiré',
        code: 'INVALID_TOKEN'
      });
    }

    req.user = user;
    next();
  });
}

// Génération de token JWT
function generateAccessToken(userData) {
  return jwt.sign(
    userData,
    config.security.jwtSecret,
    { expiresIn: '24h' }
  );
}

// Vérification du mot de passe admin
async function verifyAdminPassword(password) {
  try {
    // Comparaison simple et directe pour tous les environnements
    const result = password === config.security.adminPassword;
    logger.debug(`Vérification mot de passe: ${result ? 'succès' : 'échec'}`);
    return result;
  } catch (error) {
    logger.error('Erreur lors de la vérification du mot de passe:', error.message);
    return false;
  }
}

// Middleware optionnel pour les routes publiques avec token
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1] || req.cookies?.token;

  if (token) {
    jwt.verify(token, config.security.jwtSecret, (err, user) => {
      if (!err) {
        req.user = user;
      }
    });
  }

  next();
}

// Middleware de validation des permissions
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentification requise',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!req.user.permissions || !req.user.permissions.includes(permission)) {
      logger.warn(`Accès refusé pour ${req.user.username} à ${permission}`);
      return res.status(403).json({
        error: 'Permission insuffisante',
        code: 'INSUFFICIENT_PERMISSION'
      });
    }

    next();
  };
}

// Génération d'un refresh token (pour extension future)
function generateRefreshToken(userData) {
  return jwt.sign(
    userData,
    config.security.jwtSecret + '_refresh',
    { expiresIn: '7d' }
  );
}

// Validation du refresh token
function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, config.security.jwtSecret + '_refresh');
  } catch (error) {
    return null;
  }
}

// Middleware de rate limiting spécifique à l'auth
function authRateLimit(req, res, next) {
  const clientIp = req.ip;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 5;

  // Simple in-memory store (à remplacer par Redis en production)
  if (!global.authAttempts) {
    global.authAttempts = new Map();
  }

  const attempts = global.authAttempts.get(clientIp) || [];
  const recentAttempts = attempts.filter(time => now - time < windowMs);

  if (recentAttempts.length >= maxAttempts) {
    logger.warn(`Trop de tentatives d'authentification depuis ${clientIp}`);
    return res.status(429).json({
      error: 'Trop de tentatives d\'authentification',
      retryAfter: Math.ceil((windowMs - (now - recentAttempts[0])) / 1000),
      code: 'TOO_MANY_ATTEMPTS'
    });
  }

  // Enregistrer cette tentative
  recentAttempts.push(now);
  global.authAttempts.set(clientIp, recentAttempts);

  next();
}

// Nettoyage périodique des tentatives d'auth (à appeler périodiquement)
function cleanupAuthAttempts() {
  if (!global.authAttempts) return;

  const now = Date.now();
  const windowMs = 15 * 60 * 1000;

  for (const [ip, attempts] of global.authAttempts.entries()) {
    const recentAttempts = attempts.filter(time => now - time < windowMs);
    if (recentAttempts.length === 0) {
      global.authAttempts.delete(ip);
    } else {
      global.authAttempts.set(ip, recentAttempts);
    }
  }
}

// Nettoyage automatique toutes les heures
setInterval(cleanupAuthAttempts, 60 * 60 * 1000);

module.exports = {
  authenticateToken,
  optionalAuth,
  requirePermission,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  verifyAdminPassword,
  authRateLimit,
  cleanupAuthAttempts
};
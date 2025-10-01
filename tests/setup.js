// Jest setup pour les tests TickTick Orchestrator

// Configuration de l'environnement de test
process.env.NODE_ENV = 'test';
process.env.PORT = '3002';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.ADMIN_PASSWORD = 'test123';
process.env.LOG_LEVEL = 'error'; // Réduire les logs pendant les tests

// Mock des variables d'environnement pour les APIs
process.env.TICKTICK_CLIENT_ID = 'test-ticktick-client-id';
process.env.TICKTICK_CLIENT_SECRET = 'test-ticktick-secret';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';

// Configuration des timeouts
jest.setTimeout(30000);

// Suppression des logs de console pendant les tests (optionnel)
if (process.env.SILENT_TESTS === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

// Setup global avant tous les tests
beforeAll(async () => {
  // Créer les répertoires de test si nécessaire
  const fs = require('fs');
  const path = require('path');

  const testDataDir = path.join(__dirname, '../data-test');
  const testLogsDir = path.join(testDataDir, 'logs');
  const testTokensDir = path.join(testDataDir, 'tokens');

  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }

  if (!fs.existsSync(testLogsDir)) {
    fs.mkdirSync(testLogsDir, { recursive: true });
  }

  if (!fs.existsSync(testTokensDir)) {
    fs.mkdirSync(testTokensDir, { recursive: true });
  }

  // Override des chemins pour les tests
  process.env.DATABASE_PATH = path.join(testDataDir, 'test.db');
  process.env.LOG_FILE_PATH = path.join(testLogsDir, 'test.log');
});

// Cleanup après tous les tests
afterAll(async () => {
  // Nettoyer les fichiers de test
  const fs = require('fs');
  const path = require('path');

  const testDataDir = path.join(__dirname, '../data-test');

  if (fs.existsSync(testDataDir)) {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignorer les erreurs de nettoyage
    }
  }
});

// Helpers globaux pour les tests
global.testHelpers = {
  // Helper pour créer des tâches de test
  createTestTask: (overrides = {}) => ({
    id: `test-task-${Date.now()}`,
    title: 'Test Task',
    content: 'Test task content',
    status: 0,
    priority: 1,
    tags: ['test'],
    createdTime: new Date().toISOString(),
    modifiedTime: new Date().toISOString(),
    ...overrides
  }),

  // Helper pour créer des événements de test
  createTestEvent: (overrides = {}) => ({
    id: `test-event-${Date.now()}`,
    summary: 'Test Event',
    description: 'Test event description',
    start: {
      dateTime: new Date().toISOString(),
      timeZone: 'Europe/Paris'
    },
    end: {
      dateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      timeZone: 'Europe/Paris'
    },
    ...overrides
  }),

  // Helper pour attendre
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Helper pour les requêtes API de test
  makeTestRequest: async (app, method, path, data = null, headers = {}) => {
    const request = require('supertest');

    let req = request(app)[method.toLowerCase()](path);

    // Ajouter les headers
    Object.entries(headers).forEach(([key, value]) => {
      req = req.set(key, value);
    });

    // Ajouter le body si nécessaire
    if (data && method !== 'GET') {
      req = req.send(data);
    }

    return await req;
  },

  // Helper pour générer un token JWT de test
  generateTestToken: () => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      {
        username: 'test-user',
        role: 'admin',
        permissions: ['read', 'write', 'admin']
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  }
};

// Mock des modules externes si nécessaire
jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    destroy: jest.fn()
  }))
}));

// Mock d'axios pour les appels API externes
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() }
    }
  })),
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn()
}));
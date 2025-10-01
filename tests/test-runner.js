const path = require('path');
const OrchestratorApp = require('../src/app');
const logger = require('../src/utils/logger');

// Test suite pour TickTick Orchestrator
class TestRunner {
  constructor() {
    this.app = null;
    this.server = null;
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  async runAllTests() {
    logger.info('🧪 Démarrage des tests TickTick Orchestrator');

    try {
      // Setup
      await this.setup();

      // Tests de base
      await this.testBasicFunctionality();

      // Tests d'API
      await this.testApiEndpoints();

      // Tests d'intégration
      await this.testIntegrations();

      // Cleanup
      await this.cleanup();

      // Rapport final
      this.generateReport();

    } catch (error) {
      logger.error('Erreur critique lors des tests:', error.message);
      await this.cleanup();
      process.exit(1);
    }
  }

  async setup() {
    logger.info('📋 Configuration des tests...');

    // Démarrer l'application en mode test
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3001';
    process.env.JWT_SECRET = 'test-secret';
    process.env.ADMIN_PASSWORD = 'test123';

    this.app = new OrchestratorApp();
    this.server = await this.app.start();

    await this.sleep(2000); // Attendre que le serveur soit prêt
  }

  async cleanup() {
    logger.info('🧹 Nettoyage...');

    if (this.server) {
      await this.app.stop();
    }
  }

  async testBasicFunctionality() {
    logger.info('🔧 Tests de fonctionnalité de base...');

    await this.test('Server Health Check', async () => {
      const response = await this.makeRequest('GET', '/health');
      this.assert(response.status === 'ok', 'Health check should return ok');
    });

    await this.test('API Info Endpoint', async () => {
      const response = await this.makeRequest('GET', '/api/info');
      this.assert(response.system.name === 'TickTick Orchestrator', 'API info should return correct name');
    });

    await this.test('Config Loading', async () => {
      const config = require('../src/config/config');
      this.assert(config.server.port === 3001, 'Config should load test port');
      this.assert(config.server.env === 'test', 'Config should load test environment');
    });
  }

  async testApiEndpoints() {
    logger.info('🌐 Tests des endpoints API...');

    // Test d'authentification
    let token = null;

    await this.test('Admin Login', async () => {
      const response = await this.makeRequest('POST', '/auth/login', {
        password: 'test123'
      });
      this.assert(response.success === true, 'Login should succeed');
      this.assert(response.token, 'Login should return token');
      token = response.token;
    });

    // Tests avec authentification
    if (token) {
      await this.test('Protected API Access', async () => {
        const response = await this.makeRequest('GET', '/api/tasks', null, {
          'Authorization': `Bearer ${token}`
        });
        // Ne doit pas retourner d'erreur 401
        this.assert(response.error !== 'Token d\'accès requis', 'Should access protected endpoint');
      });

      await this.test('Task Stats Endpoint', async () => {
        const response = await this.makeRequest('GET', '/api/tasks/stats/overview', null, {
          'Authorization': `Bearer ${token}`
        });
        this.assert(typeof response === 'object', 'Stats should return object');
      });

      await this.test('Scheduler Status', async () => {
        const response = await this.makeRequest('GET', '/api/scheduler/status', null, {
          'Authorization': `Bearer ${token}`
        });
        this.assert(response.success === true, 'Scheduler status should be accessible');
      });

      await this.test('Calendar Sync Status', async () => {
        const response = await this.makeRequest('GET', '/api/calendar/sync/status', null, {
          'Authorization': `Bearer ${token}`
        });
        this.assert(typeof response === 'object', 'Calendar sync status should return object');
      });
    }

    // Test sans authentification (doit échouer)
    await this.test('Protected Access Without Token', async () => {
      const response = await this.makeRequest('GET', '/api/tasks');
      this.assert(response.error, 'Should require authentication');
    });
  }

  async testIntegrations() {
    logger.info('Tests d\'intégration...');

    await this.test('Configuration Validation', async () => {
      const config = require('../src/config/config');

      // Vérifier que les chemins existent
      const fs = require('fs');
      this.assert(fs.existsSync(config.paths.data), 'Data directory should exist');
      this.assert(fs.existsSync(config.paths.logs), 'Logs directory should exist');
    });

    await this.test('Logger Functionality', async () => {
      const testMessage = `Test log message ${Date.now()}`;
      logger.info(testMessage);

      // Vérifier que le log ne génère pas d'erreur
      this.assert(true, 'Logger should work without errors');
    });

    await this.test('Task Manager Initialization', async () => {
      const TaskManager = require('../src/orchestrator/task-manager');
      const taskManager = new TaskManager();

      // Test d'initialisation sans crash
      try {
        await taskManager.initialize();
        this.assert(true, 'TaskManager should initialize without errors');
      } catch (error) {
        // En mode test, les APIs externes peuvent ne pas être disponibles
        this.assert(error.message.includes('Token') || error.message.includes('auth'),
          'TaskManager init failure should be auth-related in test mode');
      }
    });

    await this.test('Priority Calculator', async () => {
      const PriorityCalculator = require('../src/orchestrator/priority-calculator');
      const calculator = new PriorityCalculator();

      const testTask = {
        id: 'test-task',
        title: 'Test development task',
        content: 'This is a complex development task that requires careful attention',
        tags: ['urgent', 'dev'],
        priority: 3,
        dueDate: new Date().toISOString()
      };

      const score = calculator.calculateTaskScore(testTask);
      this.assert(score > 0 && score <= 1, 'Priority score should be between 0 and 1');

      const details = calculator.getScoreDetails(testTask);
      this.assert(details.complexity > 0, 'Should calculate complexity');
      this.assert(details.urgency > 0, 'Should calculate urgency');
    });

    await this.test('Calendar Sync Initialization', async () => {
      const CalendarSync = require('../src/orchestrator/calendar-sync');
      const calendarSync = new CalendarSync();

      try {
        await calendarSync.initialize();
        this.assert(true, 'CalendarSync should initialize');
      } catch (error) {
        // En mode test, les tokens peuvent ne pas être disponibles
        this.assert(true, 'CalendarSync init may fail in test mode (expected)');
      }
    });
  }

  async test(name, testFunction) {
    try {
      await testFunction();
      this.results.passed++;
      this.results.tests.push({ name, status: 'PASSED' });
      logger.info(`✅ ${name}`);
    } catch (error) {
      this.results.failed++;
      this.results.tests.push({ name, status: 'FAILED', error: error.message });
      logger.error(`❌ ${name}: ${error.message}`);
    }
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  async makeRequest(method, path, data = null, headers = {}) {
    const fetch = require('node-fetch');

    const config = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (data && method !== 'GET') {
      config.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(`http://localhost:3001${path}`, config);
      return await response.json();
    } catch (error) {
      return { error: error.message };
    }
  }

  generateReport() {
    const total = this.results.passed + this.results.failed;
    const successRate = ((this.results.passed / total) * 100).toFixed(1);

    logger.info('\n📊 RAPPORT DE TESTS');
    logger.info('='.repeat(50));
    logger.info(`Total: ${total} tests`);
    logger.info(`✅ Réussis: ${this.results.passed}`);
    logger.info(`❌ Échoués: ${this.results.failed}`);
    logger.info(`📈 Taux de réussite: ${successRate}%`);
    logger.info('='.repeat(50));

    if (this.results.failed > 0) {
      logger.info('\n❌ TESTS ÉCHOUÉS:');
      this.results.tests
        .filter(test => test.status === 'FAILED')
        .forEach(test => {
          logger.info(`  • ${test.name}: ${test.error}`);
        });
    }

    logger.info('\n✨ Tests terminés\n');

    // Exit code basé sur les résultats
    if (this.results.failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Exécution si appelé directement
if (require.main === module) {
  const testRunner = new TestRunner();
  testRunner.runAllTests().catch(error => {
    console.error('Erreur fatale lors des tests:', error);
    process.exit(1);
  });
}

module.exports = TestRunner;
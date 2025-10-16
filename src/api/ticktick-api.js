const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

class TickTickAPI {
  constructor() {
    this.baseUrl = config.ticktick.baseUrl;
    this.accessToken = null;
    this.refreshToken = null;
    this.inboxId = 'inbox127524840'; // ID de l'Inbox TickTick (fixe pour ce compte)

    // Cache en mémoire pour éviter rate limiting (TTL: 2min)
    this.cache = new Map();
    this.cacheTTL = 120000; // 2 minutes (pour éviter rate limit TickTick)

    // Throttle pour éviter rate limit (100 req/min, 300 req/5min)
    this.requestQueue = [];
    this.requestTimestamps = [];
    this.maxRequestsPerMinute = 80; // Seuil de sécurité (80 au lieu de 100)
    this.maxRequestsPer5Minutes = 250; // Seuil de sécurité (250 au lieu de 300)

    // Configuration axios avec retry automatique
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Intercepteur pour gestion automatique des tokens + throttle rate limit
    this.client.interceptors.request.use(
      async (config) => {
        // Attendre si nécessaire pour respecter le rate limit TickTick
        await this.waitForRateLimit();

        // Ajouter le token d'authentification
        if (this.accessToken) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Intercepteur pour refresh automatique des tokens
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 && this.refreshToken) {
          await this.refreshAccessToken();
          error.config.headers.Authorization = `Bearer ${this.accessToken}`;
          return this.client.request(error.config);
        }
        return Promise.reject(error);
      }
    );
  }

  // Système de throttle pour éviter rate limit TickTick
  async waitForRateLimit() {
    const now = Date.now();

    // Nettoyer les timestamps anciens (> 5 minutes)
    this.requestTimestamps = this.requestTimestamps.filter(ts => now - ts < 300000);

    // Vérifier limite 5 minutes (250/300)
    if (this.requestTimestamps.length >= this.maxRequestsPer5Minutes) {
      const oldestRequest = this.requestTimestamps[0];
      const waitTime = 300000 - (now - oldestRequest) + 1000; // +1s de sécurité
      logger.warn(`⚠️  Rate limit 5min approché (${this.requestTimestamps.length}/${this.maxRequestsPer5Minutes}), attente ${Math.round(waitTime/1000)}s`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitForRateLimit(); // Récursif après attente
    }

    // Vérifier limite 1 minute (80/100)
    const oneMinuteAgo = now - 60000;
    const recentRequests = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);

    if (recentRequests.length >= this.maxRequestsPerMinute) {
      const oldestRecentRequest = recentRequests[0];
      const waitTime = 60000 - (now - oldestRecentRequest) + 1000; // +1s de sécurité
      logger.warn(`⚠️  Rate limit 1min approché (${recentRequests.length}/${this.maxRequestsPerMinute}), attente ${Math.round(waitTime/1000)}s`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitForRateLimit(); // Récursif après attente
    }

    // Enregistrer cette requête
    this.requestTimestamps.push(now);
  }

  // Système de cache pour éviter rate limiting TickTick
  getCacheKey(method, params = {}) {
    return `${method}:${JSON.stringify(params)}`;
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      logger.debug(`Cache hit pour ${key}`);
      return cached.data;
    }
    if (cached) {
      this.cache.delete(key); // Expirer le cache
    }
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache(specificKey = null) {
    if (specificKey) {
      // Invalider seulement une clé spécifique
      this.cache.delete(specificKey);
      logger.debug(`Cache TickTick invalidé pour: ${specificKey}`);
    } else {
      // Invalider tout le cache (utilisé rarement)
      this.cache.clear();
      logger.info('Cache TickTick vidé complètement');
    }
  }

  // Authentification OAuth
  getAuthUrl() {
    const params = new URLSearchParams({
      client_id: config.ticktick.clientId,
      scope: config.ticktick.scope,
      response_type: 'code',
      redirect_uri: config.ticktick.redirectUri
    });

    // OAuth endpoints sont sur ticktick.com, pas api.ticktick.com
    const authBaseUrl = config.ticktick.authBaseUrl || 'https://ticktick.com';
    return `${authBaseUrl}/oauth/authorize?${params}`;
  }

  async exchangeCodeForToken(code) {
    try {
      logger.info(`Échange du code OAuth TickTick: ${code?.substring(0, 10)}...`);

      const authBaseUrl = config.ticktick.authBaseUrl || 'https://ticktick.com';

      // TEST 1: JSON body avec client_id/secret (méthode rollout.com)
      try {
        logger.info('Test méthode 1: JSON body');
        const response1 = await axios.post(`${authBaseUrl}/oauth/token`, {
          client_id: config.ticktick.clientId,
          client_secret: config.ticktick.clientSecret,
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: config.ticktick.redirectUri,
          scope: 'tasks:read tasks:write'
        }, {
          headers: {
            'Content-Type': 'application/json'
          }
        });

        this.accessToken = response1.data.access_token;
        this.refreshToken = response1.data.refresh_token;
        await this.saveTokens();
        logger.info('✅ TickTick tokens obtenus avec succès (méthode JSON)');
        return response1.data;
      } catch (error1) {
        logger.error('❌ Méthode 1 (JSON) échouée:', {
          status: error1.response?.status,
          statusText: error1.response?.statusText,
          data: error1.response?.data,
          headers: error1.response?.headers
        });
      }

      // TEST 2: QUERY PARAMS avec HTTP Basic Auth (méthode GitHub Gist qui fonctionne)
      try {
        logger.info('Test méthode 2: Query params + Basic Auth (comme GitHub Gist)');
        const basicAuth = Buffer.from(`${config.ticktick.clientId}:${config.ticktick.clientSecret}`).toString('base64');

        const response2 = await axios.post(`${authBaseUrl}/oauth/token`, null, {
          params: {
            code: code,
            grant_type: 'authorization_code',
            scope: 'tasks:read tasks:write',
            redirect_uri: config.ticktick.redirectUri,
            state: 'state'
          },
          headers: {
            'Authorization': `Basic ${basicAuth}`
          }
        });

        this.accessToken = response2.data.access_token;
        this.refreshToken = response2.data.refresh_token;
        await this.saveTokens();
        logger.info('✅ TickTick tokens obtenus avec succès (méthode Basic Auth)');
        return response2.data;
      } catch (error2) {
        logger.error('❌ Méthode 2 (Basic Auth) échouée:', {
          status: error2.response?.status,
          statusText: error2.response?.statusText,
          data: error2.response?.data,
          headers: error2.response?.headers
        });
      }

      // TEST 3: Form-urlencoded avec client_id/secret dans body
      try {
        logger.info('Test méthode 3: Form-urlencoded complet');
        const formData = new URLSearchParams({
          client_id: config.ticktick.clientId,
          client_secret: config.ticktick.clientSecret,
          code: code,
          grant_type: 'authorization_code',
          scope: 'tasks:read tasks:write',
          redirect_uri: config.ticktick.redirectUri
        }).toString();

        const response3 = await axios.post(`${authBaseUrl}/oauth/token`, formData, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

        this.accessToken = response3.data.access_token;
        this.refreshToken = response3.data.refresh_token;
        await this.saveTokens();
        logger.info('✅ TickTick tokens obtenus avec succès (méthode form complete)');
        return response3.data;
      } catch (error3) {
        logger.error('❌ Méthode 3 (Form complete) échouée:', {
          status: error3.response?.status,
          statusText: error3.response?.statusText,
          data: error3.response?.data,
          headers: error3.response?.headers
        });
        logger.error('🚨 TOUTES les méthodes ont échoué - VOS CREDENTIALS TICKTICK SONT PROBABLEMENT INVALIDES');
        logger.error('Vérifiez dans la console TickTick Developer:', {
          clientId: config.ticktick.clientId,
          redirectUri: config.ticktick.redirectUri,
          message: 'Le client_secret a peut-être été régénéré'
        });
        throw new Error('Impossible d\'échanger le code OAuth TickTick - Credentials invalides ?');
      }

    } catch (error) {
      logger.error('Erreur lors de l\'échange du code TickTick:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        config: {
          baseUrl: this.baseUrl,
          clientId: config.ticktick.clientId?.substring(0, 5) + '...',
          redirectUri: config.ticktick.redirectUri
        }
      });
      throw error;
    }
  }

  async refreshAccessToken() {
    try {
      // OAuth endpoints sont sur ticktick.com, pas api.ticktick.com
      const authBaseUrl = config.ticktick.authBaseUrl || 'https://ticktick.com';

      // TickTick requiert HTTP Basic Auth avec client_id:client_secret en header
      const formData = [
        `refresh_token=${encodeURIComponent(this.refreshToken)}`,
        `grant_type=refresh_token`
      ].join('&');

      // Créer le header HTTP Basic Auth
      const basicAuth = Buffer.from(`${config.ticktick.clientId}:${config.ticktick.clientSecret}`).toString('base64');

      const response = await axios.post(`${authBaseUrl}/oauth/token`, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${basicAuth}`
        }
      });

      this.accessToken = response.data.access_token;

      if (response.data.refresh_token) {
        this.refreshToken = response.data.refresh_token;
      }

      await this.saveTokens();
      logger.info('TickTick tokens rafraîchis avec succès');

      return response.data;
    } catch (error) {
      logger.error('Erreur lors du rafraîchissement des tokens TickTick:', error.message);
      throw error;
    }
  }

  // Gestion des tokens
  async saveTokens() {
    const fs = require('fs').promises;
    const path = require('path');

    const tokensPath = path.join(config.paths.tokens, 'ticktick_tokens.json');
    const tokens = {
      access_token: this.accessToken,
      refresh_token: this.refreshToken,
      timestamp: Date.now()
    };

    await fs.writeFile(tokensPath, JSON.stringify(tokens, null, 2));
  }

  async loadTokens() {
    try {
      const fs = require('fs').promises;
      const path = require('path');

      const tokensPath = path.join(config.paths.tokens, 'ticktick_tokens.json');
      const data = await fs.readFile(tokensPath, 'utf8');
      const tokens = JSON.parse(data);

      this.accessToken = tokens.access_token;
      this.refreshToken = tokens.refresh_token;

      logger.info('TickTick tokens chargés depuis le disque');
      return true;
    } catch (error) {
      logger.info('Aucun token TickTick trouvé, authentification requise');
      return false;
    }
  }

  // Gestion des tâches
  async getTasks(projectId = null, completed = false) {
    // Vérifier le cache d'abord
    const cacheKey = this.getCacheKey('getTasks', { projectId, completed });
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      // WORKAROUND: L'endpoint /open/v1/task retourne une erreur 500 "unknown_exception"
      // On utilise /open/v1/project/{id}/data pour récupérer les tâches par projet

      if (projectId) {
        // Cas spécifique : récupérer les tâches d'un seul projet
        const response = await this.client.get(`/open/v1/project/${projectId}/data`);
        const tasks = response.data.tasks || [];

        // Filtrer par statut completed
        const filteredTasks = completed
          ? tasks.filter(task => task.status === 2)
          : tasks.filter(task => task.status !== 2);

        logger.info(`${filteredTasks.length} tâches récupérées depuis TickTick (projet ${projectId})`);

        // Sauvegarder en cache
        this.setCache(cacheKey, filteredTasks);
        return filteredTasks;
      } else {
        // Récupérer TOUS les projets puis agréger toutes les tâches
        const projects = await this.getProjects();
        let allTasks = [];

        for (const project of projects) {
          try {
            const response = await this.client.get(`/open/v1/project/${project.id}/data`);
            const tasks = response.data.tasks || [];
            allTasks = allTasks.concat(tasks);
          } catch (error) {
            logger.warn(`Impossible de récupérer les tâches du projet ${project.id}:`, error.message);
          }
        }

        // ✅ RÉCUPÉRER AUSSI LES TÂCHES INBOX (qui ne sont pas dans un projet)
        try {
          const inboxResponse = await this.client.get(`/open/v1/project/${this.inboxId}/data`);
          const inboxTasks = inboxResponse.data.tasks || [];
          allTasks = allTasks.concat(inboxTasks);
          logger.info(`${inboxTasks.length} tâches Inbox ajoutées aux ${allTasks.length - inboxTasks.length} tâches de projets`);
        } catch (error) {
          logger.warn(`Impossible de récupérer les tâches Inbox (${this.inboxId}):`, error.message);
        }

        // Filtrer par statut completed
        const filteredTasks = completed
          ? allTasks.filter(task => task.status === 2)
          : allTasks.filter(task => task.status !== 2);

        logger.info(`${filteredTasks.length} tâches récupérées depuis TickTick (${projects.length} projets + Inbox)`);

        // Sauvegarder en cache
        this.setCache(cacheKey, filteredTasks);
        return filteredTasks;
      }
    } catch (error) {
      logger.error('Erreur lors de la récupération des tâches:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        hasToken: !!this.accessToken
      });
      throw error;
    }
  }

  async getTask(taskId) {
    // Vérifier le cache d'abord
    const cacheKey = this.getCacheKey('getTask', { taskId });
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.client.get(`/open/v1/task/${taskId}`);
      const task = response.data;

      // Sauvegarder en cache
      this.setCache(cacheKey, task);
      return task;
    } catch (error) {
      logger.error(`Erreur lors de la récupération de la tâche ${taskId}:`, error.message);
      throw error;
    }
  }

  async createTask(taskData) {
    try {
      const response = await this.client.post('/open/v1/task', taskData);

      logger.info(`Tâche créée: ${taskData.title}`);

      // Invalider le cache après modification
      this.clearCache();

      return response.data;
    } catch (error) {
      logger.error('Erreur lors de la création de la tâche:', error.message);
      throw error;
    }
  }

  async updateTask(taskId, taskData, skipCacheClear = false) {
    try {
      // TickTick nécessite POST /open/v1/task/${taskId} avec id, projectId, title obligatoires
      const response = await this.client.post(`/open/v1/task/${taskId}`, taskData);

      logger.info(`Tâche mise à jour: ${taskId}`);

      // Invalider le cache après modification (sauf si appelé depuis updateMultipleTasks)
      if (!skipCacheClear) {
        this.clearCache();
      }

      return response.data;
    } catch (error) {
      logger.error(`Erreur lors de la mise à jour de la tâche ${taskId}:`, error.message);
      throw error;
    }
  }

  async deleteTask(taskId, skipCacheClear = false) {
    try {
      // Récupérer la tâche pour avoir le projectId (requis par l'API TickTick)
      // Chercher dans TOUTES les tâches (actives ET complétées)
      const activeTasks = await this.getTasks(null, false);
      const completedTasks = await this.getTasks(null, true);
      const allTasks = [...activeTasks, ...completedTasks];

      const task = allTasks.find(t => t.id === taskId);

      if (!task) {
        throw new Error(`Tâche ${taskId} introuvable`);
      }

      // Endpoint DELETE simple qui FONCTIONNE: /open/v1/project/{projectId}/task/{taskId}
      await this.client.delete(`/open/v1/project/${task.projectId}/task/${taskId}`);

      logger.info(`Tâche supprimée: ${taskId} (projet: ${task.projectId})`);

      // Invalider le cache après modification (sauf si appelé depuis deleteMultipleTasks)
      if (!skipCacheClear) {
        this.clearCache();
      }

      return true;
    } catch (error) {
      logger.error(`Erreur lors de la suppression de la tâche ${taskId}:`, error.message);
      throw error;
    }
  }

  // Actions en masse
  async updateMultipleTasks(taskIds, updateData) {
    const results = [];

    // Récupérer toutes les tâches une seule fois pour avoir les champs obligatoires
    const allTasks = await this.getTasks();
    const taskMap = new Map(allTasks.map(t => [t.id, t]));

    for (const taskId of taskIds) {
      try {
        const existingTask = taskMap.get(taskId);
        if (!existingTask) {
          throw new Error(`Task ${taskId} not found`);
        }

        // Fusionner avec les champs obligatoires (id, projectId, title)
        const completeData = {
          id: existingTask.id,
          projectId: existingTask.projectId,
          title: existingTask.title,
          ...updateData
        };

        const result = await this.updateTask(taskId, completeData, true); // skipCacheClear
        results.push({ taskId, success: true, data: result });
      } catch (error) {
        results.push({ taskId, success: false, error: error.message });
      }
    }

    const successes = results.filter(r => r.success).length;
    logger.info(`Mise à jour en masse: ${successes}/${taskIds.length} tâches traitées`);

    // Invalider le cache UNE SEULE FOIS à la fin
    this.clearCache();

    return results;
  }

  async deleteMultipleTasks(taskIds) {
    const results = [];

    for (const taskId of taskIds) {
      try {
        await this.deleteTask(taskId, true); // skipCacheClear
        results.push({ taskId, success: true });
      } catch (error) {
        results.push({ taskId, success: false, error: error.message });
      }
    }

    const successes = results.filter(r => r.success).length;
    logger.info(`Suppression en masse: ${successes}/${taskIds.length} tâches supprimées`);

    // Invalider le cache UNE SEULE FOIS à la fin
    this.clearCache();

    return results;
  }

  // Gestion des projets/listes
  async getProjects() {
    // Vérifier le cache d'abord
    const cacheKey = this.getCacheKey('getProjects');
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.client.get('/open/v1/project');
      const projects = response.data;

      // Sauvegarder en cache
      this.setCache(cacheKey, projects);
      return projects;
    } catch (error) {
      logger.error('Erreur lors de la récupération des projets:', error.message);
      throw error;
    }
  }

  async getProject(projectId) {
    try {
      const response = await this.client.get(`/open/v1/project/${projectId}`);
      return response.data;
    } catch (error) {
      logger.error(`Erreur lors de la récupération du projet ${projectId}:`, error.message);
      throw error;
    }
  }

  // Filtres avancés
  async getTasksByFilter(filter) {
    try {
      const allTasks = await this.getTasks();

      let filteredTasks = allTasks;

      // Filtrage par tags
      if (filter.tags && filter.tags.length > 0) {
        filteredTasks = filteredTasks.filter(task =>
          task.tags && filter.tags.some(tag => task.tags.includes(tag))
        );
      }

      // Filtrage par liste/projet
      if (filter.projectId) {
        filteredTasks = filteredTasks.filter(task =>
          task.projectId === filter.projectId
        );
      }

      // Filtrage par date
      if (filter.dateRange) {
        const { start, end } = filter.dateRange;
        filteredTasks = filteredTasks.filter(task => {
          if (!task.dueDate) return false;
          const taskDate = new Date(task.dueDate);
          return taskDate >= start && taskDate <= end;
        });
      }

      // Filtrage par priorité
      if (filter.priority !== undefined) {
        filteredTasks = filteredTasks.filter(task =>
          task.priority === filter.priority
        );
      }

      logger.info(`Filtre appliqué: ${filteredTasks.length} tâches trouvées`);
      return filteredTasks;
    } catch (error) {
      logger.error('Erreur lors du filtrage des tâches:', error.message);
      throw error;
    }
  }

  // Vérification de l'état de la connexion
  async checkConnection() {
    try {
      await this.client.get('/open/v1/project');
      return true;
    } catch (error) {
      logger.error('Connexion TickTick échouée:', error.message);
      return false;
    }
  }
  // Vérifications de santé

  async hasValidTokens() {
    return !!(this.accessToken && this.refreshToken);
  }

  async healthCheck() {
    try {
      if (!this.accessToken) {
        logger.warn('TickTick health check: pas de token d\'accès');
        return {
          healthy: false,
          reason: 'no_access_token',
          message: 'Authentification TickTick requise'
        };
      }

      // Tester en récupérant les projets (endpoint léger)
      const startTime = Date.now();
      const projects = await this.getProjects();
      const responseTime = Date.now() - startTime;

      if (!projects || projects.length === 0) {
        logger.warn('TickTick health check: aucun projet trouvé');
        return {
          healthy: false,
          reason: 'no_projects',
          message: 'Aucun projet TickTick accessible',
          responseTime
        };
      }

      logger.info(`TickTick health check: OK (${projects.length} projets, ${responseTime}ms)`);
      return {
        healthy: true,
        projectsCount: projects.length,
        responseTime
      };

    } catch (error) {
      logger.error('TickTick health check: ÉCHEC', error.message);
      return {
        healthy: false,
        reason: 'api_error',
        message: error.message,
        error: error.response?.data || error.message
      };
    }
  }
}

module.exports = TickTickAPI;
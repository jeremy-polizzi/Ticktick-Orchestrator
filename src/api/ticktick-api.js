const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

class TickTickAPI {
  constructor() {
    this.baseUrl = config.ticktick.baseUrl;
    this.accessToken = null;
    this.refreshToken = null;

    // Configuration axios avec retry automatique
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Intercepteur pour gestion automatique des tokens
    this.client.interceptors.request.use(
      (config) => {
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

  // Authentification OAuth
  getAuthUrl() {
    const params = new URLSearchParams({
      client_id: config.ticktick.clientId,
      scope: config.ticktick.scope,
      response_type: 'code',
      redirect_uri: config.ticktick.redirectUri
    });

    return `${this.baseUrl}/oauth/authorize?${params}`;
  }

  async exchangeCodeForToken(code) {
    try {
      const response = await axios.post(`${this.baseUrl}/oauth/token`, {
        client_id: config.ticktick.clientId,
        client_secret: config.ticktick.clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: config.ticktick.redirectUri
      });

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;

      // Sauvegarder les tokens
      await this.saveTokens();

      logger.info('TickTick tokens obtenus avec succès');
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de l\'échange du code TickTick:', error.message);
      throw error;
    }
  }

  async refreshAccessToken() {
    try {
      const response = await axios.post(`${this.baseUrl}/oauth/token`, {
        client_id: config.ticktick.clientId,
        client_secret: config.ticktick.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token'
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
    try {
      const params = {
        completed: completed ? 1 : 0
      };

      if (projectId) {
        params.projectId = projectId;
      }

      const response = await this.client.get('/open/v1/task', { params });

      logger.info(`${response.data.length} tâches récupérées depuis TickTick`);
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de la récupération des tâches:', error.message);
      throw error;
    }
  }

  async getTask(taskId) {
    try {
      const response = await this.client.get(`/open/v1/task/${taskId}`);
      return response.data;
    } catch (error) {
      logger.error(`Erreur lors de la récupération de la tâche ${taskId}:`, error.message);
      throw error;
    }
  }

  async createTask(taskData) {
    try {
      const response = await this.client.post('/open/v1/task', taskData);

      logger.info(`Tâche créée: ${taskData.title}`);
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de la création de la tâche:', error.message);
      throw error;
    }
  }

  async updateTask(taskId, taskData) {
    try {
      const response = await this.client.post(`/open/v1/task/${taskId}`, taskData);

      logger.info(`Tâche mise à jour: ${taskId}`);
      return response.data;
    } catch (error) {
      logger.error(`Erreur lors de la mise à jour de la tâche ${taskId}:`, error.message);
      throw error;
    }
  }

  async deleteTask(taskId) {
    try {
      await this.client.delete(`/open/v1/task/${taskId}`);

      logger.info(`Tâche supprimée: ${taskId}`);
      return true;
    } catch (error) {
      logger.error(`Erreur lors de la suppression de la tâche ${taskId}:`, error.message);
      throw error;
    }
  }

  // Actions en masse
  async updateMultipleTasks(taskIds, updateData) {
    const results = [];

    for (const taskId of taskIds) {
      try {
        const result = await this.updateTask(taskId, updateData);
        results.push({ taskId, success: true, data: result });
      } catch (error) {
        results.push({ taskId, success: false, error: error.message });
      }
    }

    const successes = results.filter(r => r.success).length;
    logger.info(`Mise à jour en masse: ${successes}/${taskIds.length} tâches traitées`);

    return results;
  }

  async deleteMultipleTasks(taskIds) {
    const results = [];

    for (const taskId of taskIds) {
      try {
        await this.deleteTask(taskId);
        results.push({ taskId, success: true });
      } catch (error) {
        results.push({ taskId, success: false, error: error.message });
      }
    }

    const successes = results.filter(r => r.success).length;
    logger.info(`Suppression en masse: ${successes}/${taskIds.length} tâches supprimées`);

    return results;
  }

  // Gestion des projets/listes
  async getProjects() {
    try {
      const response = await this.client.get('/open/v1/project');
      return response.data;
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
}

module.exports = TickTickAPI;
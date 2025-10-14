const TickTickAPI = require('../api/ticktick-api');
const GoogleCalendarAPI = require('../api/google-calendar-api');
const PriorityCalculator = require('./priority-calculator');
const logger = require('../utils/logger');
const config = require('../config/config');

class TaskManager {
  constructor() {
    this.ticktick = new TickTickAPI();
    this.googleCalendar = new GoogleCalendarAPI();
    this.priorityCalculator = new PriorityCalculator();
    this.manualModifications = new Map(); // Suivi des modifications manuelles
  }

  async initialize() {
    try {
      // Charger les tokens sauvegardés
      await this.ticktick.loadTokens();
      await this.googleCalendar.loadTokens();

      logger.info('TaskManager initialisé avec succès');
      return true;
    } catch (error) {
      logger.error('Erreur lors de l\'initialisation du TaskManager:', error.message);
      return false;
    }
  }

  // === GESTION INDIVIDUELLE DES TÂCHES ===

  async getTask(taskId) {
    try {
      const task = await this.ticktick.getTask(taskId);
      logger.logTaskAction('get', { id: taskId, title: task.title });
      return task;
    } catch (error) {
      logger.error(`Erreur lors de la récupération de la tâche ${taskId}:`, error.message);
      throw error;
    }
  }

  async updateTask(taskId, updateData, skipManualTracking = false) {
    try {
      // Traquer les modifications manuelles
      if (!skipManualTracking) {
        this.trackManualModification(taskId);
      }

      // TickTick nécessite id, projectId, title obligatoires
      // Récupérer la tâche pour avoir ces champs si pas fournis
      if (!updateData.id || !updateData.projectId || !updateData.title) {
        const allTasks = await this.ticktick.getTasks();
        const existingTask = allTasks.find(t => t.id === taskId);

        if (!existingTask) {
          throw new Error(`Task ${taskId} not found`);
        }

        // Fusionner avec les champs obligatoires
        updateData = {
          id: existingTask.id,
          projectId: existingTask.projectId,
          title: existingTask.title,
          ...updateData
        };
      }

      const updatedTask = await this.ticktick.updateTask(taskId, updateData);

      logger.logTaskAction('update', { id: taskId, ...updateData }, 'success');
      return updatedTask;
    } catch (error) {
      logger.error(`Erreur lors de la mise à jour de la tâche ${taskId}:`, error.message);
      throw error;
    }
  }

  async deleteTask(taskId) {
    try {
      await this.ticktick.deleteTask(taskId);
      this.manualModifications.delete(taskId); // Nettoyer le suivi

      logger.logTaskAction('delete', { id: taskId }, 'success');
      return true;
    } catch (error) {
      logger.error(`Erreur lors de la suppression de la tâche ${taskId}:`, error.message);
      throw error;
    }
  }

  async createTask(taskData) {
    try {
      const newTask = await this.ticktick.createTask(taskData);

      logger.logTaskAction('create', taskData, newTask.id);
      return newTask;
    } catch (error) {
      logger.error('Erreur lors de la création de la tâche:', error.message);
      throw error;
    }
  }

  // === ACTIONS EN MASSE ===

  async updateMultipleTasks(taskIds, updateData) {
    try {
      logger.info(`Début de la mise à jour en masse de ${taskIds.length} tâches`);

      const results = await this.ticktick.updateMultipleTasks(taskIds, updateData);

      // Traquer toutes les modifications manuelles
      taskIds.forEach(taskId => this.trackManualModification(taskId));

      const successes = results.filter(r => r.success).length;
      logger.logAction('mass_update', {
        total: taskIds.length,
        successes,
        failures: taskIds.length - successes,
        updateData
      });

      return results;
    } catch (error) {
      logger.error('Erreur lors de la mise à jour en masse:', error.message);
      throw error;
    }
  }

  async deleteMultipleTasks(taskIds) {
    try {
      logger.info(`Début de la suppression en masse de ${taskIds.length} tâches`);

      const results = await this.ticktick.deleteMultipleTasks(taskIds);

      // Nettoyer le suivi des modifications
      taskIds.forEach(taskId => this.manualModifications.delete(taskId));

      const successes = results.filter(r => r.success).length;
      logger.logAction('mass_delete', {
        total: taskIds.length,
        successes,
        failures: taskIds.length - successes
      });

      return results;
    } catch (error) {
      logger.error('Erreur lors de la suppression en masse:', error.message);
      throw error;
    }
  }

  // === FILTRAGE ET RECHERCHE ===

  async getTasksByFilter(filter) {
    try {
      const tasks = await this.ticktick.getTasksByFilter(filter);

      logger.logAction('filter_tasks', {
        filter,
        resultsCount: tasks.length
      });

      return tasks;
    } catch (error) {
      logger.error('Erreur lors du filtrage des tâches:', error.message);
      throw error;
    }
  }

  async processNaturalLanguageCommand(command) {
    try {
      logger.info(`Traitement de la commande: "${command}"`);

      const parsedCommand = this.parseNaturalLanguage(command);
      const result = await this.executeCommand(parsedCommand);

      logger.logAction('natural_language', {
        originalCommand: command,
        parsedCommand,
        result: result ? 'success' : 'failed'
      });

      return result;
    } catch (error) {
      logger.error('Erreur lors du traitement de la commande en langage naturel:', error.message);
      throw error;
    }
  }

  parseNaturalLanguage(command) {
    const lowercaseCommand = command.toLowerCase();

    // Patterns de reconnaissance
    const patterns = {
      list: /(?:liste|affiche|montre|voir|donne|obtenir)[-\s]*(moi|me|nous)?\s+(?:les?\s+)?(?:tâches?|tasks?)/i,
      move: /d[ée]placer?.*(vers|dans|à)\s+(.+?)(?:\s|$)/i,
      tag: /ajouter?\s+(?:le\s+)?tag\s+([#\w]+)/i,
      delete: /supprimer?.*(tâches?|tous?)/i,
      priority: /priorit[ée]s?\s+(.+?)(?:\s|$)/i,
      complete: /(?:marquer|terminer?).*(?:comme\s+)?(?:terminé|fini|fait)/i,
      schedule: /planifier?\s+(.+?)\s+(?:pour|le)\s+(.+)/i
    };

    // Extraire les filtres
    const tagMatch = command.match(/#(\w+)/g);
    // Ne pas matcher "liste moi" comme nom de liste - seulement si "de la liste X" ou "dans la liste X"
    const listMatch = command.match(/(?:de\s+la\s+liste|dans\s+la\s+liste|liste)\s+['""]?([^'""]+)['""]?/i);
    const dateMatch = command.match(/(?:aujourd'hui|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}\/\d{1,2})/i);

    const parsed = {
      action: null,
      filters: {},
      parameters: {}
    };

    // Déterminer l'action (ordre important: list doit être avant les autres)
    if (patterns.list.test(lowercaseCommand)) {
      parsed.action = 'list';
    } else if (patterns.move.test(lowercaseCommand)) {
      parsed.action = 'move';
      const match = lowercaseCommand.match(patterns.move);
      parsed.parameters.targetList = match[2].trim();
    } else if (patterns.tag.test(lowercaseCommand)) {
      parsed.action = 'add_tag';
      const match = lowercaseCommand.match(patterns.tag);
      parsed.parameters.tag = match[1];
    } else if (patterns.delete.test(lowercaseCommand)) {
      parsed.action = 'delete';
    } else if (patterns.priority.test(lowercaseCommand)) {
      parsed.action = 'prioritize';
      const match = lowercaseCommand.match(patterns.priority);
      parsed.parameters.scope = match[1].trim();
    } else if (patterns.complete.test(lowercaseCommand)) {
      parsed.action = 'complete';
    } else if (patterns.schedule.test(lowercaseCommand)) {
      parsed.action = 'schedule';
      const match = lowercaseCommand.match(patterns.schedule);
      parsed.parameters.tasks = match[1].trim();
      parsed.parameters.date = match[2].trim();
    }

    // Ajouter les filtres
    if (tagMatch) {
      parsed.filters.tags = tagMatch.map(tag => tag.substring(1)); // Enlever le #
    }

    // Pour l'action 'list', ne pas ajouter de filtre sur listName si c'est "liste moi"
    if (listMatch && parsed.action !== 'list') {
      parsed.filters.listName = listMatch[1];
    }

    if (dateMatch) {
      parsed.filters.date = this.parseDate(dateMatch[0]);
    }

    return parsed;
  }

  async executeCommand(parsedCommand) {
    try {
      // Récupérer les tâches selon les filtres
      const tasks = await this.getTasksByFilter(parsedCommand.filters);

      if (tasks.length === 0) {
        logger.warn('Aucune tâche trouvée pour les filtres spécifiés');
        return { success: false, message: 'Aucune tâche trouvée' };
      }

      const taskIds = tasks.map(task => task.id);

      switch (parsedCommand.action) {
        case 'list':
          // Action de visualisation - retourner simplement les tâches
          logger.info(`Retour de ${tasks.length} tâches filtrées`);
          return {
            success: true,
            action: 'list',
            tasks: tasks,
            count: tasks.length,
            message: `${tasks.length} tâche(s) trouvée(s)`
          };

        case 'move':
          const targetProject = await this.findProjectByName(parsedCommand.parameters.targetList);
          if (!targetProject) {
            throw new Error(`Liste "${parsedCommand.parameters.targetList}" non trouvée`);
          }

          return await this.updateMultipleTasks(taskIds, {
            projectId: targetProject.id
          });

        case 'add_tag':
          const results = [];
          for (const task of tasks) {
            const currentTags = task.tags || [];
            const newTags = [...new Set([...currentTags, parsedCommand.parameters.tag])];
            const result = await this.updateTask(task.id, { tags: newTags });
            results.push(result);
          }
          return results;

        case 'delete':
          return await this.deleteMultipleTasks(taskIds);

        case 'complete':
          return await this.updateMultipleTasks(taskIds, { status: 2 }); // 2 = completed

        case 'prioritize':
          return await this.prioritizeTasks(tasks, parsedCommand.parameters.scope);

        case 'schedule':
          const targetDate = this.parseDate(parsedCommand.parameters.date);
          return await this.updateMultipleTasks(taskIds, {
            dueDate: targetDate.toISOString()
          });

        default:
          throw new Error(`Action non reconnue: ${parsedCommand.action}`);
      }
    } catch (error) {
      logger.error('Erreur lors de l\'exécution de la commande:', error.message);
      throw error;
    }
  }

  // === GESTION DES MODIFICATIONS MANUELLES ===

  trackManualModification(taskId) {
    const now = new Date();
    this.manualModifications.set(taskId, {
      timestamp: now,
      date: now.toDateString()
    });

    logger.info(`Modification manuelle trackée pour la tâche ${taskId}`);
  }

  isManuallyModifiedToday(taskId) {
    const modification = this.manualModifications.get(taskId);
    if (!modification) return false;

    const today = new Date().toDateString();
    return modification.date === today;
  }

  getTasksEligibleForReorganization() {
    // Retourner uniquement les tâches non modifiées manuellement aujourd'hui
    return async () => {
      const allTasks = await this.ticktick.getTasks(null, false); // Tâches non complétées

      return allTasks.filter(task => !this.isManuallyModifiedToday(task.id));
    };
  }

  // === UTILITAIRES ===

  parseDate(dateString) {
    const today = new Date();
    const lowercase = dateString.toLowerCase();

    const dateMap = {
      "aujourd'hui": today,
      "demain": new Date(today.getTime() + 24 * 60 * 60 * 1000),
      "lundi": this.getNextWeekday(1),
      "mardi": this.getNextWeekday(2),
      "mercredi": this.getNextWeekday(3),
      "jeudi": this.getNextWeekday(4),
      "vendredi": this.getNextWeekday(5),
      "samedi": this.getNextWeekday(6),
      "dimanche": this.getNextWeekday(0)
    };

    if (dateMap[lowercase]) {
      return dateMap[lowercase];
    }

    // Format DD/MM
    const dateMatch = dateString.match(/(\d{1,2})\/(\d{1,2})/);
    if (dateMatch) {
      const day = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]) - 1; // JavaScript months are 0-indexed
      const year = today.getFullYear();

      const date = new Date(year, month, day);

      // Si la date est dans le passé, prendre l'année suivante
      if (date < today) {
        date.setFullYear(year + 1);
      }

      return date;
    }

    // Fallback: retourner aujourd'hui
    return today;
  }

  getNextWeekday(targetDay) {
    const today = new Date();
    const currentDay = today.getDay();

    let daysUntilTarget = targetDay - currentDay;
    if (daysUntilTarget <= 0) {
      daysUntilTarget += 7; // Semaine suivante
    }

    const targetDate = new Date(today.getTime() + daysUntilTarget * 24 * 60 * 60 * 1000);
    return targetDate;
  }

  async findProjectByName(name) {
    try {
      const projects = await this.ticktick.getProjects();
      return projects.find(project =>
        project.name.toLowerCase().includes(name.toLowerCase())
      );
    } catch (error) {
      logger.error('Erreur lors de la recherche de projet:', error.message);
      return null;
    }
  }

  async prioritizeTasks(tasks, scope) {
    try {
      const prioritizedTasks = await this.priorityCalculator.calculatePriorities(tasks);

      // Limite selon la configuration
      const maxTasks = config.scheduler.maxDailyTasks;
      const topTasks = prioritizedTasks.slice(0, maxTasks);

      logger.logAction('prioritize', {
        scope,
        totalTasks: tasks.length,
        selectedTasks: topTasks.length
      });

      return topTasks;
    } catch (error) {
      logger.error('Erreur lors de la priorisation:', error.message);
      throw error;
    }
  }

  // === VÉRIFICATIONS DE SANTÉ ===

  async checkConnections() {
    const ticktickStatus = await this.ticktick.checkConnection();
    const googleStatus = await this.googleCalendar.checkConnection();

    return {
      ticktick: ticktickStatus,
      google: googleStatus,
      overall: ticktickStatus && googleStatus
    };
  }
}

module.exports = TaskManager;
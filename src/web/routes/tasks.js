const express = require('express');
const router = express.Router();
const TaskManager = require('../../orchestrator/task-manager');
const PriorityCalculator = require('../../orchestrator/priority-calculator');
const logger = require('../../utils/logger');

// Instance du gestionnaire de tâches
const taskManager = new TaskManager();
const priorityCalculator = new PriorityCalculator();

// Initialiser le gestionnaire
taskManager.initialize().catch(error => {
  logger.error('Erreur lors de l\'initialisation du TaskManager:', error.message);
});

// === GESTION INDIVIDUELLE DES TÂCHES ===

// Récupérer toutes les tâches
router.get('/', async (req, res) => {
  try {
    const {
      projectId,
      completed = 'false',
      tags,
      priority,
      dateFrom,
      dateTo,
      limit = 100
    } = req.query;

    // Construire le filtre
    const filter = {};

    if (projectId) filter.projectId = projectId;
    if (tags) filter.tags = tags.split(',');
    if (priority) filter.priority = parseInt(priority);

    if (dateFrom || dateTo) {
      filter.dateRange = {};
      if (dateFrom) filter.dateRange.start = new Date(dateFrom);
      if (dateTo) filter.dateRange.end = new Date(dateTo);
    }

    // Récupérer les tâches
    let tasks;
    if (Object.keys(filter).length > 0) {
      tasks = await taskManager.getTasksByFilter(filter);
    } else {
      tasks = await taskManager.ticktick.getTasks(null, completed === 'true');
    }

    // Limiter les résultats
    const limitedTasks = tasks.slice(0, parseInt(limit));

    // Calculer les priorités si demandé
    if (req.query.withPriorities === 'true') {
      const prioritizedTasks = await priorityCalculator.calculatePriorities(limitedTasks);
      return res.json({
        success: true,
        tasks: prioritizedTasks,
        total: tasks.length,
        returned: prioritizedTasks.length,
        withPriorities: true
      });
    }

    res.json({
      success: true,
      tasks: limitedTasks,
      total: tasks.length,
      returned: limitedTasks.length
    });

  } catch (error) {
    logger.error('Erreur lors de la récupération des tâches:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la récupération des tâches',
      details: error.message
    });
  }
});

// Récupérer une tâche spécifique
router.get('/:id', async (req, res) => {
  try {
    const task = await taskManager.getTask(req.params.id);

    // Ajouter les détails de priorité
    if (req.query.withPriority === 'true') {
      task.priority_details = priorityCalculator.getScoreDetails(task);
      task.priority_score = priorityCalculator.calculateTaskScore(task);
    }

    res.json({
      success: true,
      task
    });

  } catch (error) {
    logger.error(`Erreur lors de la récupération de la tâche ${req.params.id}:`, error.message);

    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'Tâche non trouvée',
        id: req.params.id
      });
    }

    res.status(500).json({
      error: 'Erreur lors de la récupération de la tâche',
      details: error.message
    });
  }
});

// Créer une nouvelle tâche
router.post('/', async (req, res) => {
  try {
    const taskData = req.body;

    // Validation des données requises
    if (!taskData.title) {
      return res.status(400).json({
        error: 'Le titre de la tâche est requis',
        field: 'title'
      });
    }

    const newTask = await taskManager.createTask(taskData);

    logger.info(`Tâche créée via API: ${newTask.title}`);

    res.status(201).json({
      success: true,
      task: newTask,
      message: 'Tâche créée avec succès'
    });

  } catch (error) {
    logger.error('Erreur lors de la création de la tâche:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la création de la tâche',
      details: error.message
    });
  }
});

// Mettre à jour une tâche
router.put('/:id', async (req, res) => {
  try {
    const taskId = req.params.id;
    const updateData = req.body;

    const updatedTask = await taskManager.updateTask(taskId, updateData);

    logger.info(`Tâche mise à jour via API: ${taskId}`);

    res.json({
      success: true,
      task: updatedTask,
      message: 'Tâche mise à jour avec succès'
    });

  } catch (error) {
    logger.error(`Erreur lors de la mise à jour de la tâche ${req.params.id}:`, error.message);

    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'Tâche non trouvée',
        id: req.params.id
      });
    }

    res.status(500).json({
      error: 'Erreur lors de la mise à jour de la tâche',
      details: error.message
    });
  }
});

// Supprimer une tâche
router.delete('/:id', async (req, res) => {
  try {
    const taskId = req.params.id;

    await taskManager.deleteTask(taskId);

    logger.info(`Tâche supprimée via API: ${taskId}`);

    res.json({
      success: true,
      message: 'Tâche supprimée avec succès',
      id: taskId
    });

  } catch (error) {
    logger.error(`Erreur lors de la suppression de la tâche ${req.params.id}:`, error.message);

    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'Tâche non trouvée',
        id: req.params.id
      });
    }

    res.status(500).json({
      error: 'Erreur lors de la suppression de la tâche',
      details: error.message
    });
  }
});

// === ACTIONS EN MASSE ===

// Mettre à jour plusieurs tâches
router.put('/bulk/update', async (req, res) => {
  try {
    const { taskIds, updateData } = req.body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        error: 'Liste de tâches requise',
        field: 'taskIds'
      });
    }

    if (!updateData || typeof updateData !== 'object') {
      return res.status(400).json({
        error: 'Données de mise à jour requises',
        field: 'updateData'
      });
    }

    const results = await taskManager.updateMultipleTasks(taskIds, updateData);

    const successes = results.filter(r => r.success).length;

    logger.info(`Mise à jour en masse via API: ${successes}/${taskIds.length} tâches`);

    res.json({
      success: true,
      results,
      summary: {
        total: taskIds.length,
        successes,
        failures: taskIds.length - successes
      },
      message: `${successes}/${taskIds.length} tâches mises à jour`
    });

  } catch (error) {
    logger.error('Erreur lors de la mise à jour en masse:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la mise à jour en masse',
      details: error.message
    });
  }
});

// Supprimer plusieurs tâches
router.delete('/bulk/delete', async (req, res) => {
  try {
    const { taskIds } = req.body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        error: 'Liste de tâches requise',
        field: 'taskIds'
      });
    }

    const results = await taskManager.deleteMultipleTasks(taskIds);

    const successes = results.filter(r => r.success).length;

    logger.info(`Suppression en masse via API: ${successes}/${taskIds.length} tâches`);

    res.json({
      success: true,
      results,
      summary: {
        total: taskIds.length,
        successes,
        failures: taskIds.length - successes
      },
      message: `${successes}/${taskIds.length} tâches supprimées`
    });

  } catch (error) {
    logger.error('Erreur lors de la suppression en masse:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la suppression en masse',
      details: error.message
    });
  }
});

// === COMMANDES EN LANGAGE NATUREL ===

// Traiter une commande en langage naturel
router.post('/command', async (req, res) => {
  try {
    const { command } = req.body;

    if (!command || typeof command !== 'string') {
      return res.status(400).json({
        error: 'Commande requise',
        field: 'command'
      });
    }

    const result = await taskManager.processNaturalLanguageCommand(command);

    logger.info(`Commande traitée via API: "${command}"`);

    res.json({
      success: true,
      command,
      result,
      message: 'Commande exécutée avec succès'
    });

  } catch (error) {
    logger.error('Erreur lors du traitement de la commande:', error.message);
    res.status(500).json({
      error: 'Erreur lors du traitement de la commande',
      details: error.message,
      command: req.body.command
    });
  }
});

// === FILTRAGE ET RECHERCHE AVANCÉE ===

// Recherche de tâches avec filtres avancés
router.post('/search', async (req, res) => {
  try {
    const filter = req.body;

    const tasks = await taskManager.getTasksByFilter(filter);

    // Calculer les priorités si demandé
    if (filter.withPriorities) {
      const prioritizedTasks = await priorityCalculator.calculatePriorities(tasks);
      return res.json({
        success: true,
        tasks: prioritizedTasks,
        total: prioritizedTasks.length,
        filter,
        withPriorities: true
      });
    }

    res.json({
      success: true,
      tasks,
      total: tasks.length,
      filter
    });

  } catch (error) {
    logger.error('Erreur lors de la recherche:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la recherche',
      details: error.message
    });
  }
});

// === PRIORISATION ===

// Calculer les priorités pour un ensemble de tâches
router.post('/prioritize', async (req, res) => {
  try {
    const { taskIds, scope = 'all' } = req.body;

    let tasks;

    if (taskIds && Array.isArray(taskIds)) {
      // Récupérer les tâches spécifiées
      tasks = [];
      for (const id of taskIds) {
        try {
          const task = await taskManager.getTask(id);
          tasks.push(task);
        } catch (error) {
          logger.warn(`Tâche ${id} non trouvée lors de la priorisation`);
        }
      }
    } else {
      // Récupérer toutes les tâches non complétées
      tasks = await taskManager.ticktick.getTasks(null, false);
    }

    const prioritizedTasks = await taskManager.prioritizeTasks(tasks, scope);

    res.json({
      success: true,
      tasks: prioritizedTasks,
      total: prioritizedTasks.length,
      scope,
      message: 'Priorisation calculée avec succès'
    });

  } catch (error) {
    logger.error('Erreur lors de la priorisation:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la priorisation',
      details: error.message
    });
  }
});

// === PROJETS/LISTES ===

// Récupérer tous les projets
router.get('/projects/list', async (req, res) => {
  try {
    const projects = await taskManager.ticktick.getProjects();

    res.json({
      success: true,
      projects,
      total: projects.length
    });

  } catch (error) {
    logger.error('Erreur lors de la récupération des projets:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la récupération des projets',
      details: error.message
    });
  }
});

// Récupérer un projet spécifique
router.get('/projects/:id', async (req, res) => {
  try {
    const project = await taskManager.ticktick.getProject(req.params.id);

    res.json({
      success: true,
      project
    });

  } catch (error) {
    logger.error(`Erreur lors de la récupération du projet ${req.params.id}:`, error.message);

    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'Projet non trouvé',
        id: req.params.id
      });
    }

    res.status(500).json({
      error: 'Erreur lors de la récupération du projet',
      details: error.message
    });
  }
});

// === STATISTIQUES ===

// Obtenir des statistiques sur les tâches
router.get('/stats/overview', async (req, res) => {
  try {
    const allTasks = await taskManager.ticktick.getTasks();
    const completedTasks = await taskManager.ticktick.getTasks(null, true);

    const stats = {
      total: allTasks.length,
      completed: completedTasks.length,
      pending: allTasks.length,
      withDates: allTasks.filter(task => task.dueDate).length,
      overdue: allTasks.filter(task => {
        if (!task.dueDate) return false;
        return new Date(task.dueDate) < new Date();
      }).length,
      today: allTasks.filter(task => {
        if (!task.dueDate) return false;
        const today = new Date().toDateString();
        return new Date(task.dueDate).toDateString() === today;
      }).length,
      thisWeek: allTasks.filter(task => {
        if (!task.dueDate) return false;
        const taskDate = new Date(task.dueDate);
        const today = new Date();
        const weekFromNow = new Date();
        weekFromNow.setDate(today.getDate() + 7);
        return taskDate >= today && taskDate <= weekFromNow;
      }).length
    };

    // Statistiques par tags
    const tagStats = {};
    allTasks.forEach(task => {
      if (task.tags) {
        task.tags.forEach(tag => {
          tagStats[tag] = (tagStats[tag] || 0) + 1;
        });
      }
    });

    // Statistiques par priorité
    const priorityStats = {
      none: allTasks.filter(task => !task.priority || task.priority === 0).length,
      low: allTasks.filter(task => task.priority === 1).length,
      medium: allTasks.filter(task => task.priority === 2 || task.priority === 3).length,
      high: allTasks.filter(task => task.priority === 4 || task.priority === 5).length
    };

    res.json({
      success: true,
      stats: {
        ...stats,
        tags: Object.entries(tagStats)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .map(([tag, count]) => ({ tag, count })),
        priorities: priorityStats
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors de la récupération des statistiques:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la récupération des statistiques',
      details: error.message
    });
  }
});

module.exports = router;
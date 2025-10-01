const cron = require('node-cron');
const TaskManager = require('../orchestrator/task-manager');
const CalendarSync = require('../orchestrator/calendar-sync');
const PriorityCalculator = require('../orchestrator/priority-calculator');
const logger = require('../utils/logger');
const config = require('../config/config');

class DailyScheduler {
  constructor() {
    this.taskManager = new TaskManager();
    this.calendarSync = new CalendarSync();
    this.priorityCalculator = new PriorityCalculator();
    this.isRunning = false;
    this.scheduledJobs = new Map();
  }

  async initialize() {
    try {
      await this.taskManager.initialize();
      await this.calendarSync.initialize();

      logger.info('DailyScheduler initialisé avec succès');
      return true;
    } catch (error) {
      logger.error('Erreur lors de l\'initialisation du DailyScheduler:', error.message);
      return false;
    }
  }

  // === TÂCHE PRINCIPALE QUOTIDIENNE ===

  async runDailyOrganization() {
    if (this.isRunning) {
      logger.warn('Organisation quotidienne déjà en cours, ignorer');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.logSchedulerAction('daily_start', {
        timestamp: new Date().toISOString(),
        timezone: config.scheduler.timezone
      });

      // 1. Vérifier les connexions
      const healthCheck = await this.checkSystemHealth();
      if (!healthCheck.overall) {
        throw new Error('Système non opérationnel, arrêt de l\'organisation');
      }

      // 2. Synchronisation complète
      await this.calendarSync.performFullSync();

      // 3. Réorganisation intelligente
      await this.performIntelligentReorganization();

      // 4. Planification des prochains jours
      await this.planUpcomingDays();

      // 5. Génération du rapport quotidien
      const report = await this.generateDailyReport();

      const duration = Date.now() - startTime;
      logger.logPerformance('daily_organization', duration);

      logger.logSchedulerAction('daily_complete', {
        duration,
        tasksProcessed: report.tasksProcessed,
        conflictsResolved: report.conflictsResolved
      });

      return report;

    } catch (error) {
      logger.error('Erreur lors de l\'organisation quotidienne:', error.message);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  async performIntelligentReorganization() {
    try {
      logger.info('Début de la réorganisation intelligente');

      // 1. Récupérer les tâches éligibles (non modifiées manuellement aujourd'hui)
      const eligibleTasksGetter = this.taskManager.getTasksEligibleForReorganization();
      const eligibleTasks = await eligibleTasksGetter();

      if (eligibleTasks.length === 0) {
        logger.info('Aucune tâche éligible pour la réorganisation');
        return;
      }

      // 2. Filtrer les tâches sans date ou avec dates passées
      const tasksToReorganize = eligibleTasks.filter(task => {
        if (!task.dueDate) return true; // Tâches sans date à planifier

        const dueDate = new Date(task.dueDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Inclure les tâches non terminées du passé
        return dueDate < today || dueDate.toDateString() === today.toDateString();
      });

      logger.info(`${tasksToReorganize.length} tâches à réorganiser`);

      // 3. Calculer les priorités
      const prioritizedTasks = await this.priorityCalculator.calculatePriorities(tasksToReorganize);

      // 4. Analyser les créneaux disponibles
      const availableSlots = await this.analyzeAvailableSlots();

      // 5. Distribuer les tâches sur les prochains jours
      const distribution = await this.distributeTasks(prioritizedTasks, availableSlots);

      // 6. Appliquer la distribution
      await this.applyTaskDistribution(distribution);

      logger.logSchedulerAction('reorganization_complete', {
        tasksProcessed: tasksToReorganize.length,
        tasksDistributed: distribution.flat().length
      });

    } catch (error) {
      logger.error('Erreur lors de la réorganisation intelligente:', error.message);
      throw error;
    }
  }

  async analyzeAvailableSlots() {
    try {
      const calendarIds = [config.calendars.jeremy, config.calendars.business];
      const slots = new Map();

      // Analyser les 14 prochains jours
      for (let i = 0; i < 14; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);

        const daySlots = await this.calendarSync.googleCalendar.getAvailableSlots(
          calendarIds,
          date,
          60 // Durée minimale: 1 heure
        );

        slots.set(date.toDateString(), daySlots);
      }

      logger.info(`Créneaux analysés pour ${slots.size} jours`);
      return slots;
    } catch (error) {
      logger.error('Erreur lors de l\'analyse des créneaux:', error.message);
      throw error;
    }
  }

  async distributeTasks(prioritizedTasks, availableSlots) {
    try {
      const distribution = [];
      const maxTasksPerDay = config.scheduler.maxDailyTasks;

      // Prendre les tâches les plus prioritaires
      const topTasks = prioritizedTasks.slice(0, maxTasksPerDay * 7); // Max 7 jours

      let currentDayIndex = 0;
      const days = Array.from(availableSlots.keys()).sort();

      for (const task of topTasks) {
        // Trouver le meilleur jour pour cette tâche
        const bestDay = this.findBestDayForTask(task, days, availableSlots, distribution);

        if (bestDay) {
          if (!distribution[bestDay]) {
            distribution[bestDay] = [];
          }

          if (distribution[bestDay].length < maxTasksPerDay) {
            distribution[bestDay].push(task);
          }
        }
      }

      logger.info(`Distribution calculée: ${Object.keys(distribution).length} jours planifiés`);
      return distribution;
    } catch (error) {
      logger.error('Erreur lors de la distribution des tâches:', error.message);
      throw error;
    }
  }

  findBestDayForTask(task, days, availableSlots, currentDistribution) {
    // Logique pour trouver le meilleur jour selon:
    // 1. Charge actuelle du jour
    // 2. Créneaux disponibles
    // 3. Contexte de la tâche

    const taskContext = this.analyzeTaskContext(task);

    for (const day of days) {
      const dayLoad = currentDistribution[day] ? currentDistribution[day].length : 0;
      const maxLoad = config.scheduler.maxDailyTasks;

      if (dayLoad >= maxLoad) continue;

      const slots = availableSlots.get(day);
      if (!slots || slots.length === 0) continue;

      // Vérifier la compatibilité du contexte
      if (this.isDayCompatibleWithTask(day, task, taskContext)) {
        return day;
      }
    }

    // Si aucun jour optimal, prendre le premier disponible
    return days.find(day => {
      const dayLoad = currentDistribution[day] ? currentDistribution[day].length : 0;
      return dayLoad < config.scheduler.maxDailyTasks;
    });
  }

  analyzeTaskContext(task) {
    const text = `${task.title} ${task.content || ''}`.toLowerCase();

    return {
      isBusiness: ['client', 'business', 'travail', 'réunion'].some(kw => text.includes(kw)),
      isCreative: ['développement', 'création', 'design'].some(kw => text.includes(kw)),
      isAdministrative: ['email', 'appel', 'administratif'].some(kw => text.includes(kw)),
      isPersonal: ['personnel', 'privé', 'famille'].some(kw => text.includes(kw)),
      isUrgent: task.tags && task.tags.includes('urgent'),
      estimatedDuration: this.estimateTaskDuration(task)
    };
  }

  isDayCompatibleWithTask(day, task, context) {
    const date = new Date(day);
    const dayOfWeek = date.getDay(); // 0 = dimanche, 1 = lundi, etc.

    // Règles de compatibilité
    if (dayOfWeek === 0 || dayOfWeek === 6) { // Weekend
      // Favoriser les tâches personnelles le weekend
      return context.isPersonal || !context.isBusiness;
    } else { // Jours de semaine
      // Favoriser les tâches business en semaine
      return context.isBusiness || !context.isPersonal;
    }
  }

  estimateTaskDuration(task) {
    // Durée estimée en minutes
    if (task.timeEstimate) {
      return task.timeEstimate;
    }

    const text = `${task.title} ${task.content || ''}`.toLowerCase();
    const wordCount = text.split(' ').length;

    // Estimation basée sur le contenu
    if (wordCount > 50 || text.includes('développement') || text.includes('création')) {
      return 120; // 2 heures
    } else if (wordCount > 20 || text.includes('formation') || text.includes('rédaction')) {
      return 90; // 1.5 heure
    } else if (text.includes('appel') || text.includes('email')) {
      return 30; // 30 minutes
    } else {
      return 60; // 1 heure par défaut
    }
  }

  async applyTaskDistribution(distribution) {
    try {
      let totalUpdated = 0;

      for (const [day, tasks] of Object.entries(distribution)) {
        const targetDate = new Date(day);

        for (const task of tasks) {
          try {
            // Mettre à jour la date de la tâche (sans heure spécifique)
            await this.taskManager.updateTask(task.id, {
              dueDate: targetDate.toISOString().split('T')[0] // Format YYYY-MM-DD
            }, true); // true = skipManualTracking

            totalUpdated++;

            logger.info(`Tâche "${task.title}" planifiée pour ${targetDate.toDateString()}`);
          } catch (error) {
            logger.error(`Erreur lors de la planification de la tâche ${task.id}:`, error.message);
          }
        }
      }

      logger.logSchedulerAction('distribution_applied', {
        totalTasks: totalUpdated,
        distribution: Object.keys(distribution).length
      });

      return totalUpdated;
    } catch (error) {
      logger.error('Erreur lors de l\'application de la distribution:', error.message);
      throw error;
    }
  }

  async planUpcomingDays() {
    try {
      logger.info('Planification des prochains jours');

      // Analyser les patterns de charge de travail
      const workloadAnalysis = await this.analyzeWorkloadPatterns();

      // Proposer des optimisations
      const optimizations = await this.suggestOptimizations(workloadAnalysis);

      if (optimizations.length > 0) {
        logger.info(`${optimizations.length} optimisations suggérées`);
        // Les optimisations pourraient être appliquées automatiquement ou signalées
      }

      return {
        workloadAnalysis,
        optimizations
      };
    } catch (error) {
      logger.error('Erreur lors de la planification des prochains jours:', error.message);
      throw error;
    }
  }

  async analyzeWorkloadPatterns() {
    try {
      const calendarIds = [config.calendars.jeremy, config.calendars.business];
      const analysis = {
        dailyLoads: [],
        peakHours: [],
        freeSlots: [],
        overloadedDays: []
      };

      // Analyser les 7 prochains jours
      for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);

        let dayEvents = [];
        for (const calendarId of calendarIds) {
          const events = await this.calendarSync.googleCalendar.getEvents(
            calendarId,
            date,
            new Date(date.getTime() + 24 * 60 * 60 * 1000)
          );
          dayEvents.push(...events);
        }

        const load = this.calculateDayLoad(dayEvents);
        analysis.dailyLoads.push({
          date: date.toDateString(),
          load,
          events: dayEvents.length
        });

        if (load > 0.8) { // Plus de 80% de charge
          analysis.overloadedDays.push(date.toDateString());
        }
      }

      return analysis;
    } catch (error) {
      logger.error('Erreur lors de l\'analyse des patterns:', error.message);
      throw error;
    }
  }

  calculateDayLoad(events) {
    const workingHours = 10; // 8h-18h = 10 heures
    let busyMinutes = 0;

    for (const event of events) {
      const start = new Date(event.start.dateTime || event.start.date);
      const end = new Date(event.end.dateTime || event.end.date);
      const duration = (end - start) / (1000 * 60); // en minutes

      busyMinutes += duration;
    }

    return Math.min(busyMinutes / (workingHours * 60), 1);
  }

  async suggestOptimizations(analysis) {
    const optimizations = [];

    // Détecter les jours surchargés
    for (const overloadedDay of analysis.overloadedDays) {
      optimizations.push({
        type: 'redistribute',
        day: overloadedDay,
        suggestion: 'Redistribuer certaines tâches vers des jours moins chargés'
      });
    }

    // Détecter les déséquilibres
    const loads = analysis.dailyLoads.map(d => d.load);
    const maxLoad = Math.max(...loads);
    const minLoad = Math.min(...loads);

    if (maxLoad - minLoad > 0.5) {
      optimizations.push({
        type: 'balance',
        suggestion: 'Rééquilibrer la charge entre les jours'
      });
    }

    return optimizations;
  }

  // === PROGRAMMATION DES TÂCHES ===

  startScheduler() {
    try {
      // Tâche quotidienne principale à 6h (comme spécifié dans CLAUDE.md)
      const dailyJob = cron.schedule(
        `0 6 * * *`, // Tous les jours à 6h
        async () => {
          try {
            logger.info('Démarrage de l\'organisation quotidienne automatique');
            await this.runDailyOrganization();
          } catch (error) {
            logger.error('Erreur lors de l\'organisation quotidienne automatique:', error.message);
          }
        },
        {
          scheduled: false,
          timezone: config.scheduler.timezone
        }
      );

      // Synchronisation régulière (toutes les 30 minutes selon config)
      const syncJob = cron.schedule(
        `*/${config.scheduler.syncInterval} * * * *`,
        async () => {
          try {
            if (!this.isRunning) { // Éviter les conflits avec l'organisation quotidienne
              await this.calendarSync.performFullSync();
            }
          } catch (error) {
            logger.error('Erreur lors de la synchronisation automatique:', error.message);
          }
        },
        {
          scheduled: false,
          timezone: config.scheduler.timezone
        }
      );

      // Vérification de santé toutes les heures
      const healthJob = cron.schedule(
        '0 * * * *',
        async () => {
          try {
            const health = await this.checkSystemHealth();
            if (!health.overall) {
              logger.warn('Système en mauvaise santé:', health);
            }
          } catch (error) {
            logger.error('Erreur lors de la vérification de santé:', error.message);
          }
        },
        {
          scheduled: false,
          timezone: config.scheduler.timezone
        }
      );

      // Démarrer les tâches
      dailyJob.start();
      syncJob.start();
      healthJob.start();

      // Sauvegarder les références
      this.scheduledJobs.set('daily', dailyJob);
      this.scheduledJobs.set('sync', syncJob);
      this.scheduledJobs.set('health', healthJob);

      logger.info('Scheduler démarré avec succès');
      logger.info(`Organisation quotidienne: tous les jours à ${config.scheduler.dailyTime}`);
      logger.info(`Synchronisation: toutes les ${config.scheduler.syncInterval} minutes`);

      return true;
    } catch (error) {
      logger.error('Erreur lors du démarrage du scheduler:', error.message);
      return false;
    }
  }

  stopScheduler() {
    try {
      for (const [name, job] of this.scheduledJobs) {
        job.stop();
        job.destroy();
        logger.info(`Tâche ${name} arrêtée`);
      }

      this.scheduledJobs.clear();
      logger.info('Scheduler arrêté avec succès');
      return true;
    } catch (error) {
      logger.error('Erreur lors de l\'arrêt du scheduler:', error.message);
      return false;
    }
  }

  // === RAPPORTS ET MONITORING ===

  async generateDailyReport() {
    try {
      const report = {
        timestamp: new Date().toISOString(),
        summary: {},
        details: {},
        recommendations: []
      };

      // Statistiques générales
      const allTasks = await this.taskManager.ticktick.getTasks();
      const completedToday = allTasks.filter(task => {
        if (task.status !== 2) return false; // Pas complétée
        const completedDate = task.completedTime ? new Date(task.completedTime) : null;
        if (!completedDate) return false;
        return completedDate.toDateString() === new Date().toDateString();
      });

      report.summary = {
        totalTasks: allTasks.length,
        completedToday: completedToday.length,
        pendingTasks: allTasks.filter(task => task.status !== 2).length,
        tasksWithDates: allTasks.filter(task => task.dueDate).length
      };

      // Santé du système
      report.details.systemHealth = await this.checkSystemHealth();

      // Statistiques de synchronisation
      report.details.syncStats = this.calendarSync.getSyncStats();

      // Analyse de productivité
      if (completedToday.length > 0) {
        report.details.productivity = {
          averageCompletionTime: this.calculateAverageCompletionTime(completedToday),
          mostProductiveTags: this.getMostProductiveTags(completedToday),
          completionTimeOfDay: this.getCompletionTimeDistribution(completedToday)
        };
      }

      // Recommandations
      if (report.summary.pendingTasks > 20) {
        report.recommendations.push('Considérer la suppression ou l\'archivage des tâches anciennes');
      }

      if (report.summary.completedToday === 0) {
        report.recommendations.push('Aucune tâche terminée aujourd\'hui, vérifier la planification');
      }

      if (!report.details.systemHealth.overall) {
        report.recommendations.push('Problème de connectivité détecté, vérifier les authentifications');
      }

      logger.logSchedulerAction('daily_report_generated', report.summary);

      return report;
    } catch (error) {
      logger.error('Erreur lors de la génération du rapport quotidien:', error.message);
      throw error;
    }
  }

  calculateAverageCompletionTime(tasks) {
    // Calcul approximatif basé sur les heures de modification
    const times = tasks.map(task => {
      const completed = new Date(task.modifiedTime || task.completedTime);
      return completed.getHours() * 60 + completed.getMinutes();
    });

    const average = times.reduce((sum, time) => sum + time, 0) / times.length;
    const hours = Math.floor(average / 60);
    const minutes = Math.round(average % 60);

    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  }

  getMostProductiveTags(tasks) {
    const tagCounts = {};

    tasks.forEach(task => {
      if (task.tags) {
        task.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    return Object.entries(tagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));
  }

  getCompletionTimeDistribution(tasks) {
    const distribution = {
      morning: 0,   // 6h-12h
      afternoon: 0, // 12h-18h
      evening: 0    // 18h-22h
    };

    tasks.forEach(task => {
      const completed = new Date(task.modifiedTime || task.completedTime);
      const hour = completed.getHours();

      if (hour >= 6 && hour < 12) {
        distribution.morning++;
      } else if (hour >= 12 && hour < 18) {
        distribution.afternoon++;
      } else if (hour >= 18 && hour < 22) {
        distribution.evening++;
      }
    });

    return distribution;
  }

  async checkSystemHealth() {
    try {
      const connections = await this.taskManager.checkConnections();
      const syncHealth = await this.calendarSync.checkSyncHealth();

      return {
        ...connections,
        sync: syncHealth,
        overall: connections.overall && syncHealth.overall,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Erreur lors de la vérification de santé du système:', error.message);
      return {
        ticktick: false,
        google: false,
        sync: false,
        overall: false,
        error: error.message
      };
    }
  }

  // === UTILITÉS ===

  getSchedulerStatus() {
    return {
      isRunning: this.isRunning,
      scheduledJobs: Array.from(this.scheduledJobs.keys()),
      lastRun: this.lastRunTime,
      nextRun: this.getNextRunTime(),
      timezone: config.scheduler.timezone
    };
  }

  getNextRunTime() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(6, 0, 0, 0); // 6h du matin

    return tomorrow.toISOString();
  }

  // Méthode pour exécution manuelle
  async runManualOrganization() {
    logger.info('Organisation manuelle déclenchée');
    return await this.runDailyOrganization();
  }
}

// Mode standalone pour exécution directe
if (require.main === module) {
  const scheduler = new DailyScheduler();

  async function main() {
    try {
      await scheduler.initialize();

      if (process.argv.includes('--run-once')) {
        // Exécution unique
        logger.info('Exécution unique de l\'organisation quotidienne');
        await scheduler.runDailyOrganization();
        process.exit(0);
      } else {
        // Mode scheduler continu
        logger.info('Démarrage du scheduler continu');
        scheduler.startScheduler();

        // Gestion propre de l\'arrêt
        process.on('SIGINT', () => {
          logger.info('Arrêt du scheduler...');
          scheduler.stopScheduler();
          process.exit(0);
        });

        process.on('SIGTERM', () => {
          logger.info('Arrêt du scheduler...');
          scheduler.stopScheduler();
          process.exit(0);
        });
      }
    } catch (error) {
      logger.error('Erreur fatale:', error.message);
      process.exit(1);
    }
  }

  main();
}

module.exports = DailyScheduler;
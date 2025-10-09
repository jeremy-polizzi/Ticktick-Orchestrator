const GoogleCalendarAPI = require('../api/google-calendar-api');
const TickTickAPI = require('../api/ticktick-api');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * Backup Manager - Système de sauvegarde et rollback
 *
 * MISSION: Créer snapshots avant toute opération automatique majeure
 * pour pouvoir revenir en arrière si chaos détecté
 */
class BackupManager {
  constructor() {
    this.googleCalendar = new GoogleCalendarAPI();
    this.ticktick = new TickTickAPI();

    this.backupDir = path.join(__dirname, '../../data/backups');
    this.maxBackups = 30; // Garder 30 jours

    // S'assurer que le répertoire existe
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  async initialize() {
    try {
      await this.googleCalendar.loadTokens();
      await this.ticktick.loadTokens();

      logger.info('BackupManager initialisé avec succès');
      return true;
    } catch (error) {
      logger.error('Erreur lors de l\'initialisation du BackupManager:', error.message);
      return false;
    }
  }

  // === CRÉATION SNAPSHOT ===

  async createSnapshot(reason = 'manual') {
    try {
      logger.info(`📸 Création snapshot: ${reason}`);

      const startTime = Date.now();
      const timestamp = new Date().toISOString();
      const snapshotId = `snapshot_${Date.now()}`;

      // 1. Sauvegarder Google Calendar
      const calendarData = await this.backupGoogleCalendar();

      // 2. Sauvegarder TickTick
      const ticktickData = await this.backupTickTick();

      // 3. Créer le snapshot
      const snapshot = {
        id: snapshotId,
        timestamp,
        reason,
        calendar: calendarData,
        ticktick: ticktickData,
        metadata: {
          createdAt: timestamp,
          duration: Date.now() - startTime,
          calendarEventsCount: calendarData.totalEvents,
          ticktickTasksCount: ticktickData.totalTasks
        }
      };

      // 4. Sauvegarder sur disque
      const snapshotPath = path.join(this.backupDir, `${snapshotId}.json`);
      fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));

      // 5. Nettoyer anciens snapshots
      await this.cleanOldBackups();

      logger.info(`✅ Snapshot créé: ${snapshotId} (${snapshot.metadata.calendarEventsCount} événements, ${snapshot.metadata.ticktickTasksCount} tâches)`);

      return {
        success: true,
        snapshotId,
        snapshot,
        path: snapshotPath
      };

    } catch (error) {
      logger.error('Erreur lors de la création du snapshot:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async backupGoogleCalendar() {
    const calendarIds = ['primary', 'jeremy@polizzi.com', 'business@polizzi.com'];
    const calendars = [];
    let totalEvents = 0;

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1); // Début du mois
    const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0); // Fin du mois +1

    for (const calendarId of calendarIds) {
      try {
        const events = await this.googleCalendar.getEvents(calendarId, startDate, endDate);

        calendars.push({
          calendarId,
          events: events.map(event => ({
            id: event.id,
            summary: event.summary,
            description: event.description,
            start: event.start,
            end: event.end,
            colorId: event.colorId,
            reminders: event.reminders,
            extendedProperties: event.extendedProperties
          })),
          count: events.length
        });

        totalEvents += events.length;

      } catch (error) {
        logger.warn(`Impossible de sauvegarder le calendrier ${calendarId}:`, error.message);
      }
    }

    return {
      totalEvents,
      calendars,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      }
    };
  }

  async backupTickTick() {
    try {
      const tasks = await this.ticktick.getTasks();

      return {
        totalTasks: tasks.length,
        tasks: tasks.map(task => ({
          id: task.id,
          title: task.title,
          content: task.content,
          dueDate: task.dueDate,
          priority: task.priority,
          tags: task.tags,
          status: task.status,
          projectId: task.projectId,
          completedTime: task.completedTime
        }))
      };

    } catch (error) {
      logger.error('Erreur lors de la sauvegarde TickTick:', error.message);
      return {
        totalTasks: 0,
        tasks: [],
        error: error.message
      };
    }
  }

  // === RESTAURATION ===

  async restore(snapshotId) {
    try {
      logger.info(`🔄 Restauration snapshot: ${snapshotId}`);

      // 1. Charger le snapshot
      const snapshot = await this.loadSnapshot(snapshotId);

      if (!snapshot) {
        throw new Error(`Snapshot ${snapshotId} introuvable`);
      }

      const startTime = Date.now();

      // 2. Créer snapshot de sécurité AVANT restauration
      const preRestoreSnapshot = await this.createSnapshot('pre_restore');

      // 3. Restaurer Google Calendar
      const calendarRestored = await this.restoreGoogleCalendar(snapshot.calendar);

      // 4. Restaurer TickTick
      const ticktickRestored = await this.restoreTickTick(snapshot.ticktick);

      const duration = Date.now() - startTime;

      logger.info(`✅ Restauration terminée en ${duration}ms`);

      return {
        success: true,
        snapshotId,
        preRestoreSnapshot: preRestoreSnapshot.snapshotId,
        restored: {
          calendar: calendarRestored,
          ticktick: ticktickRestored
        },
        duration
      };

    } catch (error) {
      logger.error('Erreur lors de la restauration:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async restoreGoogleCalendar(calendarData) {
    const restored = {
      created: 0,
      deleted: 0,
      errors: []
    };

    try {
      // Pour chaque calendrier
      for (const calendar of calendarData.calendars) {
        const { calendarId, events } = calendar;

        // Récupérer événements actuels
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0);

        const currentEvents = await this.googleCalendar.getEvents(calendarId, startDate, endDate);

        // Supprimer événements qui n'existent pas dans le snapshot
        for (const currentEvent of currentEvents) {
          const existsInSnapshot = events.some(e => e.id === currentEvent.id);

          if (!existsInSnapshot) {
            try {
              await this.googleCalendar.deleteEvent(calendarId, currentEvent.id);
              restored.deleted++;
              logger.debug(`Événement supprimé: ${currentEvent.summary}`);
            } catch (error) {
              restored.errors.push(`Erreur suppression ${currentEvent.id}: ${error.message}`);
            }
          }
        }

        // Recréer événements du snapshot qui n'existent plus
        for (const snapshotEvent of events) {
          const existsCurrent = currentEvents.some(e => e.id === snapshotEvent.id);

          if (!existsCurrent) {
            try {
              await this.googleCalendar.createEvent(calendarId, {
                summary: snapshotEvent.summary,
                description: snapshotEvent.description,
                start: snapshotEvent.start,
                end: snapshotEvent.end,
                colorId: snapshotEvent.colorId,
                reminders: snapshotEvent.reminders
              });
              restored.created++;
              logger.debug(`Événement recréé: ${snapshotEvent.summary}`);
            } catch (error) {
              restored.errors.push(`Erreur création ${snapshotEvent.summary}: ${error.message}`);
            }
          }
        }
      }

    } catch (error) {
      logger.error('Erreur lors de la restauration Google Calendar:', error.message);
      restored.errors.push(error.message);
    }

    return restored;
  }

  async restoreTickTick(ticktickData) {
    const restored = {
      created: 0,
      deleted: 0,
      errors: []
    };

    try {
      const currentTasks = await this.ticktick.getTasks();

      // Supprimer tâches qui n'existent pas dans le snapshot
      for (const currentTask of currentTasks) {
        const existsInSnapshot = ticktickData.tasks.some(t => t.id === currentTask.id);

        if (!existsInSnapshot) {
          try {
            await this.ticktick.deleteTask(currentTask.id);
            restored.deleted++;
            logger.debug(`Tâche supprimée: ${currentTask.title}`);
          } catch (error) {
            restored.errors.push(`Erreur suppression ${currentTask.id}: ${error.message}`);
          }
        }
      }

      // Recréer tâches du snapshot qui n'existent plus
      for (const snapshotTask of ticktickData.tasks) {
        const existsCurrent = currentTasks.some(t => t.id === snapshotTask.id);

        if (!existsCurrent) {
          try {
            await this.ticktick.createTask({
              title: snapshotTask.title,
              content: snapshotTask.content,
              dueDate: snapshotTask.dueDate,
              priority: snapshotTask.priority,
              tags: snapshotTask.tags
            });
            restored.created++;
            logger.debug(`Tâche recréée: ${snapshotTask.title}`);
          } catch (error) {
            restored.errors.push(`Erreur création ${snapshotTask.title}: ${error.message}`);
          }
        }
      }

    } catch (error) {
      logger.error('Erreur lors de la restauration TickTick:', error.message);
      restored.errors.push(error.message);
    }

    return restored;
  }

  // === GESTION SNAPSHOTS ===

  async loadSnapshot(snapshotId) {
    try {
      const snapshotPath = path.join(this.backupDir, `${snapshotId}.json`);

      if (!fs.existsSync(snapshotPath)) {
        return null;
      }

      const snapshotData = fs.readFileSync(snapshotPath, 'utf8');
      return JSON.parse(snapshotData);

    } catch (error) {
      logger.error(`Erreur lors du chargement du snapshot ${snapshotId}:`, error.message);
      return null;
    }
  }

  async listSnapshots() {
    try {
      const files = fs.readdirSync(this.backupDir);
      const snapshots = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const snapshotPath = path.join(this.backupDir, file);
          const snapshotData = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

          snapshots.push({
            id: snapshotData.id,
            timestamp: snapshotData.timestamp,
            reason: snapshotData.reason,
            calendarEventsCount: snapshotData.metadata.calendarEventsCount,
            ticktickTasksCount: snapshotData.metadata.ticktickTasksCount
          });
        }
      }

      // Trier par date (plus récent en premier)
      snapshots.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return snapshots;

    } catch (error) {
      logger.error('Erreur lors de la liste des snapshots:', error.message);
      return [];
    }
  }

  async cleanOldBackups() {
    try {
      const snapshots = await this.listSnapshots();

      if (snapshots.length > this.maxBackups) {
        const toDelete = snapshots.slice(this.maxBackups);

        for (const snapshot of toDelete) {
          const snapshotPath = path.join(this.backupDir, `${snapshot.id}.json`);
          fs.unlinkSync(snapshotPath);
          logger.debug(`Ancien snapshot supprimé: ${snapshot.id}`);
        }

        logger.info(`${toDelete.length} anciens snapshots supprimés`);
      }

    } catch (error) {
      logger.error('Erreur lors du nettoyage des backups:', error.message);
    }
  }

  async deleteSnapshot(snapshotId) {
    try {
      const snapshotPath = path.join(this.backupDir, `${snapshotId}.json`);

      if (fs.existsSync(snapshotPath)) {
        fs.unlinkSync(snapshotPath);
        logger.info(`Snapshot supprimé: ${snapshotId}`);
        return true;
      }

      return false;

    } catch (error) {
      logger.error(`Erreur lors de la suppression du snapshot ${snapshotId}:`, error.message);
      return false;
    }
  }

  // === DÉTECTION CHAOS ===

  async detectChaos() {
    try {
      const now = new Date();
      const startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);

      const calendarIds = ['primary'];
      let totalEvents = 0;
      let eventsAtMidnight = 0;
      let overlappingEvents = 0;

      for (const calendarId of calendarIds) {
        const events = await this.googleCalendar.getEvents(calendarId, startDate, endDate);
        totalEvents += events.length;

        // Détecter événements à minuit
        events.forEach(event => {
          if (event.start.dateTime) {
            const start = new Date(event.start.dateTime);
            if (start.getHours() === 0 && start.getMinutes() === 0) {
              eventsAtMidnight++;
            }
          }
        });

        // Détecter chevauchements
        for (let i = 0; i < events.length; i++) {
          for (let j = i + 1; j < events.length; j++) {
            if (events[i].start.dateTime && events[j].start.dateTime) {
              const start1 = new Date(events[i].start.dateTime);
              const end1 = new Date(events[i].end.dateTime);
              const start2 = new Date(events[j].start.dateTime);

              if (start2 < end1) {
                overlappingEvents++;
              }
            }
          }
        }
      }

      const chaosLevel = this.calculateChaosLevel({
        totalEvents,
        eventsAtMidnight,
        overlappingEvents
      });

      return {
        chaosDetected: chaosLevel > 50,
        chaosLevel,
        issues: {
          totalEvents,
          eventsAtMidnight,
          overlappingEvents
        },
        recommendation: chaosLevel > 50 ? 'Restaurer dernier snapshot' : 'Aucune action requise'
      };

    } catch (error) {
      logger.error('Erreur lors de la détection du chaos:', error.message);
      return {
        chaosDetected: false,
        error: error.message
      };
    }
  }

  calculateChaosLevel(issues) {
    let score = 0;

    // Trop d'événements dans la journée
    if (issues.totalEvents > 20) {
      score += 30;
    }

    // Événements à minuit = chaos
    if (issues.eventsAtMidnight > 0) {
      score += issues.eventsAtMidnight * 20;
    }

    // Chevauchements = chaos
    if (issues.overlappingEvents > 3) {
      score += issues.overlappingEvents * 15;
    }

    return Math.min(100, score);
  }
}

module.exports = BackupManager;

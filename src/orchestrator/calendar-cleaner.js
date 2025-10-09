const GoogleCalendarAPI = require('../api/google-calendar-api');
const logger = require('../utils/logger');
const config = require('../config/config');

class CalendarCleaner {
  constructor() {
    this.googleCalendar = new GoogleCalendarAPI();
    this.isRunning = false;

    // Exceptions cohérentes : appels OK pendant ces sessions
    this.cohesionKeywords = [
      'crm', 'cap numérique', 'kap', 'matinal',
      'session', 'intensive', 'travail',
      'prospection', 'formation'
    ];
  }

  async initialize() {
    try {
      await this.googleCalendar.loadTokens();
      logger.info('CalendarCleaner initialisé avec succès');
      return true;
    } catch (error) {
      logger.error('Erreur lors de l\'initialisation du CalendarCleaner:', error.message);
      return false;
    }
  }

  // === NETTOYAGE COMPLET ===

  async performCleanup() {
    if (this.isRunning) {
      logger.warn('Nettoyage déjà en cours, ignorer');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('🧹 Début du nettoyage automatique du calendrier');

      const issues = {
        tasksAtMidnight: [],
        multipleTasksSameTime: [],
        fixed: 0,
        skipped: 0
      };

      // 1. Détecter les tâches à minuit
      const midnightTasks = await this.detectTasksAtMidnight();
      issues.tasksAtMidnight = midnightTasks;

      // 2. Détecter les tâches multiples au même moment (hors exceptions)
      const overlappingTasks = await this.detectOverlappingTasks();
      issues.multipleTasksSameTime = overlappingTasks;

      // 3. Corriger automatiquement
      if (midnightTasks.length > 0) {
        logger.warn(`⚠️ ${midnightTasks.length} tâches détectées à minuit`);
        await this.fixMidnightTasks(midnightTasks);
        issues.fixed += midnightTasks.length;
      }

      if (overlappingTasks.length > 0) {
        logger.warn(`⚠️ ${overlappingTasks.length} conflits détectés`);
        await this.fixOverlappingTasks(overlappingTasks);
        issues.fixed += overlappingTasks.length;
      }

      const duration = Date.now() - startTime;
      logger.info(`✅ Nettoyage terminé en ${duration}ms - ${issues.fixed} corrections, ${issues.skipped} ignorées`);

      return issues;

    } catch (error) {
      logger.error('Erreur lors du nettoyage:', error.message);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  // === DÉTECTION TÂCHES À MINUIT ===

  async detectTasksAtMidnight() {
    try {
      const calendarIds = [config.calendars.jeremy, config.calendars.business];
      const now = new Date();
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + 7); // Vérifier sur 7 jours

      const midnightTasks = [];

      for (const calendarId of calendarIds) {
        const events = await this.googleCalendar.getEvents(calendarId, now, endDate);

        events.forEach(event => {
          // Vérifier si événement à minuit (00:00 ou 23:59)
          const start = event.start.dateTime ? new Date(event.start.dateTime) : null;

          if (start) {
            const hours = start.getHours();
            const minutes = start.getMinutes();

            // Minuit = 00:00 ou 23:59
            if ((hours === 0 && minutes === 0) || (hours === 23 && minutes === 59)) {
              midnightTasks.push({
                calendarId,
                event,
                issue: 'midnight',
                time: start.toISOString()
              });
            }
          }
        });
      }

      return midnightTasks;
    } catch (error) {
      logger.error('Erreur lors de la détection des tâches à minuit:', error.message);
      return [];
    }
  }

  // === DÉTECTION TÂCHES MULTIPLES MÊME MOMENT ===

  async detectOverlappingTasks() {
    try {
      const calendarIds = [config.calendars.jeremy, config.calendars.business];
      const now = new Date();
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + 7);

      const allEvents = [];

      // Récupérer tous les événements
      for (const calendarId of calendarIds) {
        const events = await this.googleCalendar.getEvents(calendarId, now, endDate);

        events.forEach(event => {
          if (event.start.dateTime && event.end.dateTime) {
            allEvents.push({
              calendarId,
              event,
              start: new Date(event.start.dateTime),
              end: new Date(event.end.dateTime)
            });
          }
        });
      }

      // Trier par date de début
      allEvents.sort((a, b) => a.start - b.start);

      // Détecter les chevauchements
      const overlaps = [];

      for (let i = 0; i < allEvents.length; i++) {
        const current = allEvents[i];

        for (let j = i + 1; j < allEvents.length; j++) {
          const next = allEvents[j];

          // Si l'événement suivant commence avant la fin du courant
          if (next.start < current.end) {
            // Vérifier si c'est une exception cohérente
            const isCohesive = this.isCohesiveOverlap(current.event, next.event);

            if (!isCohesive) {
              overlaps.push({
                event1: current,
                event2: next,
                issue: 'overlap',
                time: current.start.toISOString()
              });
            }
          } else {
            // Les événements suivants ne chevaucheront plus
            break;
          }
        }
      }

      return overlaps;
    } catch (error) {
      logger.error('Erreur lors de la détection des chevauchements:', error.message);
      return [];
    }
  }

  // === VÉRIFIER SI CHEVAUCHEMENT COHÉRENT ===

  isCohesiveOverlap(event1, event2) {
    const title1 = (event1.summary || '').toLowerCase();
    const title2 = (event2.summary || '').toLowerCase();

    // Exception 1: Un des deux est une session de travail (CRM, etc.)
    const isWorkSession1 = this.cohesionKeywords.some(keyword => title1.includes(keyword));
    const isWorkSession2 = this.cohesionKeywords.some(keyword => title2.includes(keyword));

    // Exception 2: Un des deux est un appel/RDV
    const isCall1 = title1.includes('appel') || title1.includes('rdv') || title1.includes('rendez-vous');
    const isCall2 = title2.includes('appel') || title2.includes('rdv') || title2.includes('rendez-vous');

    // Cohérent si : Appel pendant session de travail
    if ((isCall1 && isWorkSession2) || (isCall2 && isWorkSession1)) {
      logger.debug(`✅ Chevauchement cohérent: "${event1.summary}" + "${event2.summary}"`);
      return true;
    }

    // Incohérent sinon
    return false;
  }

  // === CORRECTION TÂCHES À MINUIT ===

  async fixMidnightTasks(midnightTasks) {
    try {
      for (const task of midnightTasks) {
        const { calendarId, event } = task;

        logger.info(`🔧 Correction tâche à minuit: "${event.summary}"`);

        // Trouver un créneau disponible dans la journée
        const targetDate = new Date(event.start.dateTime);
        const availableSlots = await this.googleCalendar.getAvailableSlots(
          [calendarId],
          targetDate,
          60, // 1h par défaut
          {
            bufferMinutes: 15,
            excludeMorning: true,
            morningEndHour: 12
          }
        );

        if (availableSlots.length > 0) {
          // Prendre le premier créneau disponible
          const slot = availableSlots[0];
          const newStart = new Date(slot.start);
          const newEnd = new Date(newStart.getTime() + 60 * 60 * 1000); // +1h

          // Mettre à jour l'événement
          await this.googleCalendar.updateEvent(calendarId, event.id, {
            start: {
              dateTime: newStart.toISOString(),
              timeZone: config.scheduler.timezone
            },
            end: {
              dateTime: newEnd.toISOString(),
              timeZone: config.scheduler.timezone
            }
          });

          logger.info(`✅ Tâche déplacée de 00:00 vers ${newStart.toLocaleTimeString('fr-FR')}`);
        } else {
          logger.warn(`❌ Aucun créneau disponible pour "${event.summary}", tâche non corrigée`);
        }
      }
    } catch (error) {
      logger.error('Erreur lors de la correction des tâches à minuit:', error.message);
    }
  }

  // === CORRECTION TÂCHES CHEVAUCHANTES ===

  async fixOverlappingTasks(overlappingTasks) {
    try {
      for (const overlap of overlappingTasks) {
        const { event1, event2 } = overlap;

        logger.info(`🔧 Correction chevauchement: "${event1.event.summary}" vs "${event2.event.summary}"`);

        // Stratégie: Déplacer l'événement le moins prioritaire
        // (On pourrait implémenter une logique de priorité plus sophistiquée)

        // Pour l'instant: déplacer le 2e événement
        const targetDate = event2.start;
        const duration = Math.floor((event2.end - event2.start) / (1000 * 60)); // minutes

        const availableSlots = await this.googleCalendar.getAvailableSlots(
          [event2.calendarId],
          targetDate,
          duration,
          {
            bufferMinutes: 15,
            excludeMorning: true,
            morningEndHour: 12
          }
        );

        if (availableSlots.length > 0) {
          const slot = availableSlots[0];
          const newStart = new Date(slot.start);
          const newEnd = new Date(newStart.getTime() + duration * 60 * 1000);

          await this.googleCalendar.updateEvent(event2.calendarId, event2.event.id, {
            start: {
              dateTime: newStart.toISOString(),
              timeZone: config.scheduler.timezone
            },
            end: {
              dateTime: newEnd.toISOString(),
              timeZone: config.scheduler.timezone
            }
          });

          logger.info(`✅ Événement déplacé vers ${newStart.toLocaleTimeString('fr-FR')}`);
        } else {
          logger.warn(`❌ Aucun créneau disponible pour résoudre le conflit`);
        }
      }
    } catch (error) {
      logger.error('Erreur lors de la correction des chevauchements:', error.message);
    }
  }

  // === RAPPORT DE SANTÉ ===

  async generateHealthReport() {
    try {
      const midnightTasks = await this.detectTasksAtMidnight();
      const overlappingTasks = await this.detectOverlappingTasks();

      return {
        isHealthy: midnightTasks.length === 0 && overlappingTasks.length === 0,
        issues: {
          midnightTasks: midnightTasks.length,
          overlappingTasks: overlappingTasks.length
        },
        details: {
          midnightTasks,
          overlappingTasks
        }
      };
    } catch (error) {
      logger.error('Erreur lors de la génération du rapport de santé:', error.message);
      return {
        isHealthy: false,
        error: error.message
      };
    }
  }
}

module.exports = CalendarCleaner;

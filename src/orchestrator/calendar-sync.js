const GoogleCalendarAPI = require('../api/google-calendar-api');
const TickTickAPI = require('../api/ticktick-api');
const logger = require('../utils/logger');
const config = require('../config/config');

class CalendarSync {
  constructor() {
    this.googleCalendar = new GoogleCalendarAPI();
    this.ticktick = new TickTickAPI();
    this.syncMap = new Map(); // Mapping tâches TickTick <-> événements Google
    this.lastSyncTime = new Date();
  }

  async initialize() {
    try {
      await this.googleCalendar.loadTokens();
      await this.ticktick.loadTokens();
      await this.loadSyncMap();

      logger.info('CalendarSync initialisé avec succès');
      return true;
    } catch (error) {
      logger.error('Erreur lors de l\'initialisation de CalendarSync:', error.message);
      return false;
    }
  }

  // === SYNCHRONISATION BIDIRECTIONNELLE ===

  async performFullSync() {
    try {
      logger.info('Début de la synchronisation complète');

      const startTime = Date.now();

      // 1. Synchroniser TickTick vers Google Calendar
      await this.syncTickTickToGoogle();

      // 2. Synchroniser Google Calendar vers TickTick (si configuré)
      // await this.syncGoogleToTickTick();

      // 3. Résoudre les conflits
      await this.resolveConflicts();

      // 4. Nettoyer les orphelins
      await this.cleanupOrphans();

      const duration = Date.now() - startTime;
      logger.logPerformance('full_sync', duration);

      this.lastSyncTime = new Date();
      await this.saveSyncMap();

      logger.info(`Synchronisation complète terminée en ${duration}ms`);
      return true;
    } catch (error) {
      logger.error('Erreur lors de la synchronisation complète:', error.message);
      throw error;
    }
  }

  async syncTickTickToGoogle() {
    try {
      logger.info('Synchronisation TickTick → Google Calendar');

      // SÉCURITÉ CRITIQUE: Vérifier que TickTick fonctionne AVANT de toucher Google Calendar
      const ticktickHealth = await this.ticktick.healthCheck();

      if (!ticktickHealth.healthy) {
        logger.error(`❌ SYNCHRONISATION BLOQUÉE: TickTick n'est pas opérationnel`);
        logger.error(`   Raison: ${ticktickHealth.reason}`);
        logger.error(`   Message: ${ticktickHealth.message}`);
        throw new Error(`TickTick non opérationnel: ${ticktickHealth.message}`);
      }

      logger.info(`✅ TickTick health check OK (${ticktickHealth.projectsCount} projets, ${ticktickHealth.responseTime}ms)`);

      // Récupérer toutes les tâches non complétées avec dates
      const tasks = await this.ticktick.getTasks();

      if (!tasks || tasks.length === 0) {
        logger.warn('⚠️ SYNCHRONISATION ARRÊTÉE: TickTick n\'a retourné aucune tâche');
        logger.warn('   Cela peut indiquer un problème avec l\'API TickTick');
        logger.warn('   Aucun événement Google Calendar ne sera créé pour éviter les incohérences');
        return;
      }

      const tasksWithDates = tasks.filter(task => task.dueDate);

      logger.info(`${tasksWithDates.length} tâches à synchroniser (${tasks.length} total)`);

      for (const task of tasksWithDates) {
        await this.syncTaskToCalendar(task);
      }

      logger.logSyncAction('ticktick', 'google', {
        tasksProcessed: tasksWithDates.length
      });

    } catch (error) {
      logger.error('Erreur lors de la synchronisation TickTick → Google:', error.message);
      throw error;
    }
  }

  async syncTaskToCalendar(task, forceUpdate = false) {
    try {
      const calendarId = this.determineTargetCalendar(task);
      const existingEventId = this.syncMap.get(task.id);

      // Vérifier si la tâche doit être synchronisée
      if (!this.shouldSyncTask(task)) {
        logger.debug(`Tâche ${task.id} ignorée pour la synchronisation`);
        return;
      }

      // Convertir la tâche en événement (maintenant asynchrone)
      const eventData = await this.convertTaskToEvent(task);

      // Si aucun créneau disponible, eventData sera null
      if (!eventData) {
        logger.warn(`Tâche "${task.title}" non synchronisée : aucun créneau disponible`);
        // TODO: Déclencher réorganisation intelligente ou report de tâche
        return;
      }

      if (existingEventId) {
        // Mettre à jour l'événement existant
        if (forceUpdate || await this.hasTaskChanged(task)) {
          await this.googleCalendar.updateEvent(calendarId, existingEventId, eventData);
          logger.info(`Événement mis à jour: ${task.title}`);
        }
      } else {
        // Créer un nouvel événement
        const event = await this.googleCalendar.createEvent(calendarId, eventData);
        this.syncMap.set(task.id, event.id);
        logger.info(`Nouvel événement créé: ${task.title}`);
      }

      logger.logSyncAction('task_to_calendar', task.id, {
        calendarId,
        action: existingEventId ? 'update' : 'create'
      });

    } catch (error) {
      logger.error(`Erreur lors de la synchronisation de la tâche ${task.id}:`, error.message);
    }
  }

  determineTargetCalendar(task) {
    // Logique pour déterminer le bon calendrier selon la tâche
    const text = `${task.title} ${task.content || ''}`.toLowerCase();

    // Mots-clés pour le calendrier business
    const businessKeywords = [
      'client', 'business', 'travail', 'réunion', 'rdv', 'appel',
      'développement', 'projet', 'formation', 'prospection'
    ];

    // Mots-clés pour le calendrier personnel
    const personalKeywords = [
      'personnel', 'privé', 'famille', 'sport', 'santé', 'courses',
      'médecin', 'dentiste', 'vacances', 'weekend'
    ];

    // Tags spéciaux
    if (task.tags) {
      const tags = task.tags.map(tag => tag.toLowerCase());
      if (tags.includes('business') || tags.includes('work') || tags.includes('client')) {
        return config.calendars.business;
      }
      if (tags.includes('personal') || tags.includes('private') || tags.includes('famille')) {
        return config.calendars.jeremy;
      }
    }

    // Analyse du contenu
    const isBusinessTask = businessKeywords.some(keyword => text.includes(keyword));
    const isPersonalTask = personalKeywords.some(keyword => text.includes(keyword));

    if (isBusinessTask && !isPersonalTask) {
      return config.calendars.business;
    }

    // Par défaut: calendrier principal Jeremy
    return config.calendars.jeremy;
  }

  shouldSyncTask(task) {
    // Ne pas synchroniser les tâches complétées
    if (task.status === 2) return false;

    // Ne pas synchroniser les tâches sans date
    if (!task.dueDate) return false;

    // Ne pas synchroniser les tâches trop anciennes (>30 jours dans le passé)
    const dueDate = new Date(task.dueDate);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (dueDate < thirtyDaysAgo) return false;

    // Ne pas synchroniser les tâches trop loin (>365 jours dans le futur)
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    if (dueDate > oneYearFromNow) return false;

    // Filtrer selon des tags spéciaux
    if (task.tags && task.tags.includes('no-calendar')) return false;

    return true;
  }

  async convertTaskToEvent(task) {
    const eventData = {
      summary: this.formatEventTitle(task),
      description: this.formatEventDescription(task),
      start: {},
      end: {},
      reminders: {
        useDefault: false,
        overrides: [] // Pas de rappels par défaut selon CLAUDE.md
      }
    };

    // Gestion des dates - FIX BUG MINUIT
    let dueDate = new Date(task.dueDate);

    // 🐛 FIX: Si la date est à minuit (00:00), c'est probablement une date sans heure
    // On ne doit PAS placer la tâche à minuit mais chercher un créneau disponible
    const isDateOnly = dueDate.getHours() === 0 && dueDate.getMinutes() === 0 && dueDate.getSeconds() === 0;

    if (isDateOnly || (task.allDay !== false && !task.startDate)) {
      // Tâche sans heure spécifique - TOUJOURS chercher un créneau disponible
      const scheduledSlot = await this.scheduleTaskInSlot(task, dueDate);

      if (scheduledSlot) {
        // Placer dans un créneau spécifique avec espacement
        eventData.start.dateTime = scheduledSlot.start.toISOString();
        eventData.end.dateTime = scheduledSlot.end.toISOString();
        eventData.start.timeZone = config.scheduler.timezone;
        eventData.end.timeZone = config.scheduler.timezone;

        logger.info(`Tâche "${task.title}" planifiée dans créneau ${scheduledSlot.start.toLocaleTimeString('fr-FR')} - ${scheduledSlot.end.toLocaleTimeString('fr-FR')}`);
      } else {
        // 🚨 AUCUN créneau disponible - JAMAIS de journée entière
        // Options: Réorganiser TickTick OU déplacer événements moins prioritaires
        logger.warn(`❌ AUCUN créneau disponible pour "${task.title}" le ${dueDate.toDateString()}`);
        logger.warn(`🔄 Action requise: Réorganiser agenda ou déplacer tâche TickTick`);

        // NE PAS créer l'événement - retourner null pour indiquer échec
        return null;
      }
    } else {
      // Événement avec heure spécifique (déjà définie par l'utilisateur)
      let startTime = dueDate;
      let endTime = new Date(dueDate);

      // Si durée estimée disponible
      if (task.timeEstimate) {
        endTime.setMinutes(endTime.getMinutes() + task.timeEstimate);
      } else {
        // Durée par défaut: 1 heure
        endTime.setHours(endTime.getHours() + 1);
      }

      eventData.start.dateTime = startTime.toISOString();
      eventData.end.dateTime = endTime.toISOString();
      eventData.start.timeZone = config.scheduler.timezone;
      eventData.end.timeZone = config.scheduler.timezone;
    }

    // Couleur selon la priorité
    eventData.colorId = this.getEventColor(task);

    // Métadonnées pour la synchronisation
    eventData.extendedProperties = {
      private: {
        ticktickId: task.id,
        syncVersion: Date.now().toString()
      }
    };

    return eventData;
  }

  async scheduleTaskInSlot(task, targetDate) {
    try {
      const calendarIds = [config.calendars.jeremy, config.calendars.business];

      // Estimer la durée de la tâche
      const estimatedDuration = this.estimateTaskDuration(task);

      // 🐛 FIX: S'assurer que targetDate n'est pas à minuit
      // Si targetDate est à 00:00, on utilise la date du jour pour chercher des créneaux
      let searchDate = new Date(targetDate);
      if (searchDate.getHours() === 0 && searchDate.getMinutes() === 0) {
        // Utiliser la date mais chercher des créneaux durant la journée
        logger.debug(`Recherche créneaux pour date ${searchDate.toDateString()} (pas minuit)`);
      }

      // Récupérer les créneaux disponibles avec buffer de 15 minutes
      const availableSlots = await this.googleCalendar.getAvailableSlots(
        calendarIds,
        searchDate,
        estimatedDuration,
        {
          bufferMinutes: 15,
          excludeMorning: true,
          morningEndHour: 12
        }
      );

      if (availableSlots.length === 0) {
        logger.warn(`Aucun créneau disponible pour la tâche "${task.title}" le ${searchDate.toDateString()}`);
        return null;
      }

      // Choisir le meilleur créneau selon la priorité de la tâche
      const bestSlot = this.selectBestSlot(task, availableSlots, estimatedDuration);

      if (!bestSlot) {
        return null;
      }

      // Créer les dates de début/fin dans le créneau
      const start = new Date(bestSlot.start);
      const end = new Date(start.getTime() + estimatedDuration * 60 * 1000);

      return { start, end };
    } catch (error) {
      logger.error(`Erreur lors de la planification de la tâche ${task.id}:`, error.message);
      return null;
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

  selectBestSlot(task, slots, duration) {
    // Priorité aux tâches urgentes : prendre le premier créneau disponible
    if (task.tags && task.tags.includes('urgent')) {
      return slots[0];
    }

    // Pour les tâches créatives/développement : préférer l'après-midi
    const text = `${task.title} ${task.content || ''}`.toLowerCase();
    const isCreative = ['développement', 'création', 'design', 'rédaction'].some(kw => text.includes(kw));

    if (isCreative) {
      // Chercher un créneau après 14h
      const afternoonSlot = slots.find(slot => {
        const slotHour = slot.start.getHours();
        return slotHour >= 14 && slot.duration >= duration;
      });
      if (afternoonSlot) return afternoonSlot;
    }

    // Prendre le créneau le plus long disponible pour les tâches importantes
    if (task.priority && task.priority >= 3) {
      const sortedByDuration = [...slots].sort((a, b) => b.duration - a.duration);
      return sortedByDuration[0];
    }

    // Par défaut: premier créneau disponible
    return slots[0];
  }

  formatEventTitle(task) {
    let title = task.title;

    // Ajouter un préfixe selon le type de tâche
    if (task.tags) {
      if (task.tags.includes('urgent')) {
        title = `🔥 ${title}`;
      } else if (task.tags.includes('important')) {
        title = `⭐ ${title}`;
      } else if (task.tags.includes('client')) {
        title = `👥 ${title}`;
      }
    }

    return title;
  }

  formatEventDescription(task) {
    let description = task.content || '';

    // Ajouter les métadonnées
    const metadata = [
      `Source: TickTick`,
      `ID: ${task.id}`,
      `Synchronisé: ${new Date().toLocaleString('fr-FR', { timeZone: config.scheduler.timezone })}`
    ];

    if (task.tags && task.tags.length > 0) {
      metadata.push(`Tags: ${task.tags.map(tag => `#${tag}`).join(', ')}`);
    }

    if (task.priority && task.priority > 0) {
      metadata.push(`Priorité: ${task.priority}/5`);
    }

    if (description) {
      description += '\n\n---\n';
    }

    description += metadata.join('\n');

    return description;
  }

  getEventColor(task) {
    // Couleurs Google Calendar (1-11)
    const colors = {
      urgent: '11', // Rouge
      important: '5', // Jaune
      business: '1', // Bleu lavande
      client: '10', // Vert
      personal: '7', // Cyan
      default: '1' // Bleu par défaut
    };

    if (task.tags) {
      for (const tag of task.tags) {
        if (colors[tag.toLowerCase()]) {
          return colors[tag.toLowerCase()];
        }
      }
    }

    if (task.priority && task.priority >= 4) {
      return colors.urgent;
    } else if (task.priority && task.priority >= 3) {
      return colors.important;
    }

    return colors.default;
  }

  // === GESTION DES CONFLITS ===

  async resolveConflicts() {
    try {
      logger.info('Résolution des conflits calendaires');

      const calendarIds = [config.calendars.jeremy, config.calendars.business];
      const conflicts = [];

      // Analyser les 30 prochains jours
      const today = new Date();
      const futureDate = new Date();
      futureDate.setDate(today.getDate() + 30);

      for (const calendarId of calendarIds) {
        const events = await this.googleCalendar.getEvents(calendarId, today, futureDate);

        // Détecter les chevauchements
        for (let i = 0; i < events.length; i++) {
          for (let j = i + 1; j < events.length; j++) {
            const conflict = this.detectEventConflict(events[i], events[j]);
            if (conflict) {
              conflicts.push({
                calendarId,
                event1: events[i],
                event2: events[j],
                conflictType: conflict
              });
            }
          }
        }
      }

      if (conflicts.length > 0) {
        logger.warn(`${conflicts.length} conflits détectés`);
        await this.handleConflicts(conflicts);
      }

      return conflicts;
    } catch (error) {
      logger.error('Erreur lors de la résolution des conflits:', error.message);
      throw error;
    }
  }

  detectEventConflict(event1, event2) {
    const start1 = new Date(event1.start.dateTime || event1.start.date);
    const end1 = new Date(event1.end.dateTime || event1.end.date);
    const start2 = new Date(event2.start.dateTime || event2.start.date);
    const end2 = new Date(event2.end.dateTime || event2.end.date);

    // Vérifier le chevauchement
    if (start1 < end2 && start2 < end1) {
      // Déterminer le type de conflit
      if (start1 >= start2 && end1 <= end2) {
        return 'enclosed'; // event1 est complètement dans event2
      } else if (start2 >= start1 && end2 <= end1) {
        return 'enclosing'; // event1 englobe event2
      } else if (start1 < start2 && end1 > start2) {
        return 'overlap_start'; // Chevauche le début de event2
      } else if (start1 < end2 && end1 > end2) {
        return 'overlap_end'; // Chevauche la fin de event2
      }
      return 'partial'; // Chevauchement partiel
    }

    return null; // Pas de conflit
  }

  async handleConflicts(conflicts) {
    for (const conflict of conflicts) {
      try {
        await this.resolveSpecificConflict(conflict);
      } catch (error) {
        logger.error(`Erreur lors de la résolution du conflit:`, error.message);
      }
    }
  }

  async resolveSpecificConflict(conflict) {
    const { event1, event2, calendarId } = conflict;

    // Logique de résolution selon les règles CLAUDE.md
    const priority1 = this.getEventPriority(event1);
    const priority2 = this.getEventPriority(event2);

    if (priority1 > priority2) {
      // Déplacer event2
      await this.moveEvent(calendarId, event2);
      logger.info(`Conflit résolu: événement "${event2.summary}" déplacé`);
    } else if (priority2 > priority1) {
      // Déplacer event1
      await this.moveEvent(calendarId, event1);
      logger.info(`Conflit résolu: événement "${event1.summary}" déplacé`);
    } else {
      // Priorités égales: déplacer le plus récent
      const created1 = new Date(event1.created);
      const created2 = new Date(event2.created);

      if (created1 > created2) {
        await this.moveEvent(calendarId, event1);
        logger.info(`Conflit résolu: événement plus récent "${event1.summary}" déplacé`);
      } else {
        await this.moveEvent(calendarId, event2);
        logger.info(`Conflit résolu: événement plus récent "${event2.summary}" déplacé`);
      }
    }
  }

  getEventPriority(event) {
    // Matrice de priorités selon CLAUDE.md
    const priorities = {
      'session': 5, // Sessions d'appels/prospection
      'appel': 5,
      'rdv': 5,
      'client': 5,
      'business': 4, // Créations business
      'formation': 4,
      'développement': 4,
      'déjeuner': 3, // Pauses personnelles
      'pause': 3,
      'repos': 3,
      'personnel': 2, // Personnel/social
      'social': 2,
      'sport': 6 // Sport prioritaire selon les règles
    };

    const title = event.summary.toLowerCase();

    for (const [keyword, priority] of Object.entries(priorities)) {
      if (title.includes(keyword)) {
        return priority;
      }
    }

    return 1; // Priorité par défaut
  }

  async moveEvent(calendarId, event) {
    try {
      // Trouver le prochain créneau disponible
      const availableSlots = await this.googleCalendar.getAvailableSlots(
        [calendarId],
        new Date(event.start.dateTime || event.start.date),
        this.getEventDuration(event)
      );

      if (availableSlots.length > 0) {
        const newSlot = availableSlots[0];

        // Mettre à jour l'événement
        const updatedEvent = {
          ...event,
          start: {
            dateTime: newSlot.start.toISOString(),
            timeZone: config.scheduler.timezone
          },
          end: {
            dateTime: newSlot.end.toISOString(),
            timeZone: config.scheduler.timezone
          }
        };

        await this.googleCalendar.updateEvent(calendarId, event.id, updatedEvent);
        logger.info(`Événement déplacé vers ${newSlot.start.toLocaleString()}`);
      } else {
        logger.warn(`Aucun créneau disponible pour déplacer l'événement "${event.summary}"`);
      }
    } catch (error) {
      logger.error(`Erreur lors du déplacement de l'événement:`, error.message);
    }
  }

  getEventDuration(event) {
    const start = new Date(event.start.dateTime || event.start.date);
    const end = new Date(event.end.dateTime || event.end.date);
    return (end - start) / (1000 * 60); // Durée en minutes
  }

  // === NETTOYAGE ET MAINTENANCE ===

  async cleanupOrphans() {
    try {
      logger.info('Nettoyage des événements orphelins');

      const calendarIds = [config.calendars.jeremy, config.calendars.business];
      let orphansFound = 0;

      for (const calendarId of calendarIds) {
        const events = await this.googleCalendar.getEvents(calendarId);

        for (const event of events) {
          const ticktickId = event.extendedProperties?.private?.ticktickId;

          if (ticktickId) {
            try {
              // Vérifier si la tâche existe encore
              await this.ticktick.getTask(ticktickId);
            } catch (error) {
              if (error.response?.status === 404) {
                // Tâche supprimée, supprimer l'événement
                await this.googleCalendar.deleteEvent(calendarId, event.id);
                this.syncMap.delete(ticktickId);
                orphansFound++;
                logger.info(`Événement orphelin supprimé: ${event.summary}`);
              }
            }
          }
        }
      }

      logger.info(`${orphansFound} événements orphelins nettoyés`);
      return orphansFound;
    } catch (error) {
      logger.error('Erreur lors du nettoyage des orphelins:', error.message);
      throw error;
    }
  }

  // === GESTION DU MAPPING ===

  async saveSyncMap() {
    try {
      const fs = require('fs').promises;
      const path = require('path');

      const mapPath = path.join(config.paths.data, 'sync_map.json');
      const mapData = {
        map: Array.from(this.syncMap.entries()),
        lastSync: this.lastSyncTime.toISOString(),
        version: '1.0'
      };

      await fs.writeFile(mapPath, JSON.stringify(mapData, null, 2));
    } catch (error) {
      logger.error('Erreur lors de la sauvegarde du mapping:', error.message);
    }
  }

  async loadSyncMap() {
    try {
      const fs = require('fs').promises;
      const path = require('path');

      const mapPath = path.join(config.paths.data, 'sync_map.json');
      const data = await fs.readFile(mapPath, 'utf8');
      const mapData = JSON.parse(data);

      this.syncMap = new Map(mapData.map);
      this.lastSyncTime = new Date(mapData.lastSync);

      logger.info(`Mapping chargé: ${this.syncMap.size} associations`);
    } catch (error) {
      logger.info('Aucun mapping existant, création d\'un nouveau');
      this.syncMap = new Map();
    }
  }

  async hasTaskChanged(task) {
    // Méthode simple pour détecter les changements
    // Pourrait être améliorée avec un hash des propriétés importantes
    return true; // Pour l'instant, toujours mettre à jour
  }

  // === STATISTIQUES ET MONITORING ===

  getSyncStats() {
    return {
      lastSyncTime: this.lastSyncTime,
      totalMappings: this.syncMap.size,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
  }

  async checkSyncHealth() {
    try {
      const googleStatus = await this.googleCalendar.checkConnection();
      const ticktickStatus = await this.ticktick.checkConnection();

      return {
        google: googleStatus,
        ticktick: ticktickStatus,
        mapping: this.syncMap.size > 0,
        overall: googleStatus && ticktickStatus
      };
    } catch (error) {
      logger.error('Erreur lors de la vérification de santé:', error.message);
      return {
        google: false,
        ticktick: false,
        mapping: false,
        overall: false
      };
    }
  }
}

module.exports = CalendarSync;
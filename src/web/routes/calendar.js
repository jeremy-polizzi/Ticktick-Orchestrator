const express = require('express');
const router = express.Router();
const CalendarSync = require('../../orchestrator/calendar-sync');
const GoogleCalendarAPI = require('../../api/google-calendar-api');
const logger = require('../../utils/logger');
const config = require('../../config/config');

// Instances
const calendarSync = new CalendarSync();
const googleAPI = new GoogleCalendarAPI();

// Initialiser
calendarSync.initialize().catch(error => {
  logger.error('Erreur lors de l\'initialisation de CalendarSync:', error.message);
});

// === GESTION DES CALENDRIERS ===

// Lister tous les calendriers disponibles
router.get('/list', async (req, res) => {
  try {
    await googleAPI.loadTokens();
    const calendars = await googleAPI.getCalendars();

    res.json({
      success: true,
      calendars: calendars.map(cal => ({
        id: cal.id,
        summary: cal.summary,
        description: cal.description,
        primary: cal.primary,
        accessRole: cal.accessRole,
        backgroundColor: cal.backgroundColor,
        foregroundColor: cal.foregroundColor
      })),
      total: calendars.length
    });

  } catch (error) {
    logger.error('Erreur lors de la récupération des calendriers:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la récupération des calendriers',
      details: error.message
    });
  }
});

// === GESTION DES ÉVÉNEMENTS ===

// Récupérer les événements d'un calendrier
router.get('/:calendarId/events', async (req, res) => {
  try {
    const { calendarId } = req.params;
    const {
      timeMin,
      timeMax,
      maxResults = 100
    } = req.query;

    let startTime = null;
    let endTime = null;

    if (timeMin) {
      startTime = new Date(timeMin);
    }

    if (timeMax) {
      endTime = new Date(timeMax);
    } else if (!timeMin) {
      // Par défaut: événements des 30 prochains jours
      startTime = new Date();
      endTime = new Date();
      endTime.setDate(endTime.getDate() + 30);
    }

    const events = await googleAPI.getEvents(calendarId, startTime, endTime);

    // Limiter les résultats
    const limitedEvents = events.slice(0, parseInt(maxResults));

    res.json({
      success: true,
      events: limitedEvents.map(event => ({
        id: event.id,
        summary: event.summary,
        description: event.description,
        start: event.start,
        end: event.end,
        status: event.status,
        created: event.created,
        updated: event.updated,
        colorId: event.colorId,
        extendedProperties: event.extendedProperties
      })),
      total: events.length,
      returned: limitedEvents.length,
      calendarId
    });

  } catch (error) {
    logger.error(`Erreur lors de la récupération des événements du calendrier ${req.params.calendarId}:`, error.message);
    res.status(500).json({
      error: 'Erreur lors de la récupération des événements',
      details: error.message,
      calendarId: req.params.calendarId
    });
  }
});

// Créer un nouvel événement
router.post('/:calendarId/events', async (req, res) => {
  try {
    const { calendarId } = req.params;
    const eventData = req.body;

    // Validation des données requises
    if (!eventData.summary) {
      return res.status(400).json({
        error: 'Le titre de l\'événement est requis',
        field: 'summary'
      });
    }

    if (!eventData.start || !eventData.end) {
      return res.status(400).json({
        error: 'Les dates de début et fin sont requises',
        fields: ['start', 'end']
      });
    }

    // Vérifier les conflits si demandé
    if (req.query.checkConflicts === 'true') {
      const conflicts = await googleAPI.detectConflicts([calendarId], eventData);
      if (conflicts.length > 0) {
        return res.status(409).json({
          error: 'Conflit détecté',
          conflicts,
          suggestion: 'Utilisez forceCreate=true pour créer malgré les conflits'
        });
      }
    }

    const event = await googleAPI.createEvent(calendarId, eventData);

    logger.info(`Événement créé via API dans ${calendarId}: ${eventData.summary}`);

    res.status(201).json({
      success: true,
      event: {
        id: event.id,
        summary: event.summary,
        start: event.start,
        end: event.end,
        htmlLink: event.htmlLink
      },
      message: 'Événement créé avec succès'
    });

  } catch (error) {
    logger.error(`Erreur lors de la création d'événement dans ${req.params.calendarId}:`, error.message);
    res.status(500).json({
      error: 'Erreur lors de la création de l\'événement',
      details: error.message,
      calendarId: req.params.calendarId
    });
  }
});

// Mettre à jour un événement
router.put('/:calendarId/events/:eventId', async (req, res) => {
  try {
    const { calendarId, eventId } = req.params;
    const eventData = req.body;

    const updatedEvent = await googleAPI.updateEvent(calendarId, eventId, eventData);

    logger.info(`Événement mis à jour via API: ${eventId} dans ${calendarId}`);

    res.json({
      success: true,
      event: {
        id: updatedEvent.id,
        summary: updatedEvent.summary,
        start: updatedEvent.start,
        end: updatedEvent.end
      },
      message: 'Événement mis à jour avec succès'
    });

  } catch (error) {
    logger.error(`Erreur lors de la mise à jour de l'événement ${req.params.eventId}:`, error.message);

    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'Événement non trouvé',
        eventId: req.params.eventId,
        calendarId: req.params.calendarId
      });
    }

    res.status(500).json({
      error: 'Erreur lors de la mise à jour de l\'événement',
      details: error.message,
      eventId: req.params.eventId
    });
  }
});

// Supprimer un événement
router.delete('/:calendarId/events/:eventId', async (req, res) => {
  try {
    const { calendarId, eventId } = req.params;

    await googleAPI.deleteEvent(calendarId, eventId);

    logger.info(`Événement supprimé via API: ${eventId} dans ${calendarId}`);

    res.json({
      success: true,
      message: 'Événement supprimé avec succès',
      eventId,
      calendarId
    });

  } catch (error) {
    logger.error(`Erreur lors de la suppression de l'événement ${req.params.eventId}:`, error.message);

    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'Événement non trouvé',
        eventId: req.params.eventId,
        calendarId: req.params.calendarId
      });
    }

    res.status(500).json({
      error: 'Erreur lors de la suppression de l\'événement',
      details: error.message,
      eventId: req.params.eventId
    });
  }
});

// === SYNCHRONISATION ===

// Statut de la synchronisation
router.get('/sync/status', (req, res) => {
  try {
    const stats = calendarSync.getSyncStats();

    res.json({
      success: true,
      stats,
      mappings: stats.totalMappings,
      lastSync: stats.lastSyncTime
    });

  } catch (error) {
    logger.error('Erreur lors de la récupération du statut de sync:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la récupération du statut',
      details: error.message
    });
  }
});

// Lancer une synchronisation complète
router.post('/sync/full', async (req, res) => {
  try {
    logger.info('Synchronisation complète déclenchée via API');

    const startTime = Date.now();
    const success = await calendarSync.performFullSync();
    const duration = Date.now() - startTime;

    if (success) {
      res.json({
        success: true,
        message: 'Synchronisation complète terminée',
        duration,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        error: 'Échec de la synchronisation complète'
      });
    }

  } catch (error) {
    logger.error('Erreur lors de la synchronisation complète:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la synchronisation complète',
      details: error.message
    });
  }
});

// Synchroniser une tâche spécifique vers le calendrier
router.post('/sync/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { calendarId, options = {} } = req.body;

    // Récupérer la tâche depuis TickTick
    const task = await calendarSync.ticktick.getTask(taskId);

    if (!task) {
      return res.status(404).json({
        error: 'Tâche non trouvée',
        taskId
      });
    }

    // Synchroniser vers le calendrier
    const targetCalendar = calendarId || calendarSync.determineTargetCalendar(task);
    const result = await calendarSync.syncTaskToCalendar(task, targetCalendar, options);

    logger.info(`Tâche ${taskId} synchronisée vers ${targetCalendar}`);

    res.json({
      success: result.success,
      task: {
        id: task.id,
        title: task.title
      },
      calendarId: targetCalendar,
      result,
      message: 'Synchronisation de la tâche terminée'
    });

  } catch (error) {
    logger.error(`Erreur lors de la synchronisation de la tâche ${req.params.taskId}:`, error.message);
    res.status(500).json({
      error: 'Erreur lors de la synchronisation de la tâche',
      details: error.message,
      taskId: req.params.taskId
    });
  }
});

// === ANALYSE DES CRÉNEAUX ===

// Obtenir les créneaux disponibles
router.get('/availability', async (req, res) => {
  try {
    const {
      date,
      duration = 60,
      calendars
    } = req.query;

    if (!date) {
      return res.status(400).json({
        error: 'Date requise',
        field: 'date'
      });
    }

    const targetDate = new Date(date);
    const calendarIds = calendars ? calendars.split(',') : [config.calendars.jeremy, config.calendars.business];

    const availableSlots = await googleAPI.getAvailableSlots(
      calendarIds,
      targetDate,
      parseInt(duration)
    );

    res.json({
      success: true,
      date: targetDate.toDateString(),
      duration: parseInt(duration),
      calendars: calendarIds,
      slots: availableSlots.map(slot => ({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        duration: slot.duration
      })),
      total: availableSlots.length
    });

  } catch (error) {
    logger.error('Erreur lors de l\'analyse des créneaux:', error.message);
    res.status(500).json({
      error: 'Erreur lors de l\'analyse des créneaux',
      details: error.message
    });
  }
});

// === DÉTECTION DES CONFLITS ===

// Détecter les conflits pour un nouvel événement
router.post('/conflicts/detect', async (req, res) => {
  try {
    const {
      event,
      calendars
    } = req.body;

    if (!event || !event.start || !event.end) {
      return res.status(400).json({
        error: 'Données d\'événement requises',
        fields: ['event.start', 'event.end']
      });
    }

    const calendarIds = calendars || [config.calendars.jeremy, config.calendars.business];

    const conflicts = await googleAPI.detectConflicts(calendarIds, event);

    res.json({
      success: true,
      event: {
        summary: event.summary,
        start: event.start,
        end: event.end
      },
      conflicts: conflicts.map(conflict => ({
        calendarId: conflict.calendarId,
        conflictType: conflict.conflictType,
        conflictingEvent: {
          id: conflict.event.id,
          summary: conflict.event.summary,
          start: conflict.event.start,
          end: conflict.event.end
        }
      })),
      hasConflicts: conflicts.length > 0,
      total: conflicts.length
    });

  } catch (error) {
    logger.error('Erreur lors de la détection des conflits:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la détection des conflits',
      details: error.message
    });
  }
});

// Résoudre les conflits automatiquement
router.post('/conflicts/resolve', async (req, res) => {
  try {
    logger.info('Résolution automatique des conflits déclenchée via API');

    const conflicts = await calendarSync.resolveConflicts();

    res.json({
      success: true,
      message: 'Résolution des conflits terminée',
      conflictsFound: conflicts.length,
      conflictsResolved: conflicts.length, // Simplifié pour l'instant
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors de la résolution des conflits:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la résolution des conflits',
      details: error.message
    });
  }
});

// === NETTOYAGE ===

// Nettoyer les événements orphelins
router.post('/cleanup/orphans', async (req, res) => {
  try {
    logger.info('Nettoyage des orphelins déclenché via API');

    const orphansRemoved = await calendarSync.cleanupOrphans();

    res.json({
      success: true,
      message: 'Nettoyage des orphelins terminé',
      orphansRemoved,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors du nettoyage des orphelins:', error.message);
    res.status(500).json({
      error: 'Erreur lors du nettoyage des orphelins',
      details: error.message
    });
  }
});

// === STATISTIQUES ===

// Obtenir des statistiques sur les calendriers
router.get('/stats', async (req, res) => {
  try {
    const calendarIds = [config.calendars.jeremy, config.calendars.business];
    const stats = {
      calendars: [],
      overall: {
        totalEvents: 0,
        upcomingEvents: 0,
        syncedTasks: calendarSync.syncMap.size
      }
    };

    for (const calendarId of calendarIds) {
      try {
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);

        const allEvents = await googleAPI.getEvents(calendarId, today);
        const upcomingEvents = await googleAPI.getEvents(calendarId, today, nextWeek);

        stats.calendars.push({
          id: calendarId,
          totalEvents: allEvents.length,
          upcomingEvents: upcomingEvents.length
        });

        stats.overall.totalEvents += allEvents.length;
        stats.overall.upcomingEvents += upcomingEvents.length;

      } catch (error) {
        logger.warn(`Erreur lors de la récupération des stats pour ${calendarId}:`, error.message);
        stats.calendars.push({
          id: calendarId,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      stats,
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

// === SANTÉ ===

// Vérifier la santé de la synchronisation
router.get('/health', async (req, res) => {
  try {
    const health = await calendarSync.checkSyncHealth();

    const overallStatus = health.overall ? 200 : 503;

    res.status(overallStatus).json({
      success: health.overall,
      health,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors de la vérification de santé:', error.message);
    res.status(500).json({
      error: 'Erreur lors de la vérification de santé',
      details: error.message
    });
  }
});

module.exports = router;
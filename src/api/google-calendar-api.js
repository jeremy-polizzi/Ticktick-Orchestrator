const { google } = require('googleapis');
const config = require('../config/config');
const logger = require('../utils/logger');

// Singleton instance
let instance = null;

class GoogleCalendarAPI {
  constructor() {
    // Singleton pattern pour éviter les fuites mémoire
    if (instance) {
      return instance;
    }

    this.oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );

    this.calendar = google.calendar({
      version: 'v3',
      auth: this.oauth2Client
    });

    instance = this;
  }

  // Authentification OAuth
  getAuthUrl() {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: config.google.scope,
      prompt: 'consent'
    });
  }

  async exchangeCodeForToken(code) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);

      // Sauvegarder les tokens
      await this.saveTokens(tokens);

      logger.info('Google Calendar tokens obtenus avec succès');
      return tokens;
    } catch (error) {
      logger.error('Erreur lors de l\'échange du code Google:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        code: error.code
      });
      throw error;
    }
  }

  // Gestion des tokens
  async saveTokens(tokens) {
    const fs = require('fs').promises;
    const path = require('path');

    const tokensPath = path.join(config.paths.tokens, 'google_tokens.json');
    const tokenData = {
      ...tokens,
      timestamp: Date.now()
    };

    await fs.writeFile(tokensPath, JSON.stringify(tokenData, null, 2));
  }

  async loadTokens() {
    try {
      const fs = require('fs').promises;
      const path = require('path');

      const tokensPath = path.join(config.paths.tokens, 'google_tokens.json');
      const data = await fs.readFile(tokensPath, 'utf8');
      const tokens = JSON.parse(data);

      this.oauth2Client.setCredentials(tokens);

      // Configuration du refresh automatique (une seule fois)
      if (this.oauth2Client.listenerCount('tokens') === 0) {
        this.oauth2Client.on('tokens', async (newTokens) => {
          if (newTokens.refresh_token) {
            tokens.refresh_token = newTokens.refresh_token;
          }
          tokens.access_token = newTokens.access_token;
          await this.saveTokens(tokens);
          logger.info('Google Calendar tokens rafraîchis automatiquement');
        });
      }

      logger.info('Google Calendar tokens chargés depuis le disque');
      return true;
    } catch (error) {
      logger.info('Aucun token Google Calendar trouvé, authentification requise');
      return false;
    }
  }

  // Gestion des événements
  async getEvents(calendarId, timeMin = null, timeMax = null) {
    try {
      const params = {
        calendarId: calendarId,
        orderBy: 'startTime',
        singleEvents: true,
        maxResults: 2500
      };

      if (timeMin) {
        params.timeMin = timeMin.toISOString();
      }

      if (timeMax) {
        params.timeMax = timeMax.toISOString();
      }

      const response = await this.calendar.events.list(params);

      logger.info(`${response.data.items.length} événements récupérés du calendrier ${calendarId}`);
      return response.data.items;
    } catch (error) {
      logger.error(`Erreur lors de la récupération des événements du calendrier ${calendarId}:`, error.message);
      throw error;
    }
  }

  async createEvent(calendarId, eventData) {
    try {
      const response = await this.calendar.events.insert({
        calendarId: calendarId,
        resource: eventData
      });

      logger.info(`Événement créé dans ${calendarId}: ${eventData.summary}`);
      return response.data;
    } catch (error) {
      logger.error(`Erreur lors de la création d'événement dans ${calendarId}:`, error.message);
      throw error;
    }
  }

  async updateEvent(calendarId, eventId, eventData) {
    try {
      const response = await this.calendar.events.update({
        calendarId: calendarId,
        eventId: eventId,
        resource: eventData
      });

      logger.info(`Événement mis à jour dans ${calendarId}: ${eventId}`);
      return response.data;
    } catch (error) {
      logger.error(`Erreur lors de la mise à jour d'événement ${eventId}:`, error.message);
      throw error;
    }
  }

  async deleteEvent(calendarId, eventId) {
    try {
      await this.calendar.events.delete({
        calendarId: calendarId,
        eventId: eventId
      });

      logger.info(`Événement supprimé du calendrier ${calendarId}: ${eventId}`);
      return true;
    } catch (error) {
      logger.error(`Erreur lors de la suppression d'événement ${eventId}:`, error.message);
      throw error;
    }
  }

  // Analyse des créneaux disponibles
  async getAvailableSlots(calendarIds, date, duration = 60) {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Récupérer tous les événements des calendriers
      const allEvents = [];
      for (const calendarId of calendarIds) {
        const events = await this.getEvents(calendarId, startOfDay, endOfDay);
        allEvents.push(...events);
      }

      // Trier par heure de début
      allEvents.sort((a, b) => {
        const aStart = new Date(a.start.dateTime || a.start.date);
        const bStart = new Date(b.start.dateTime || b.start.date);
        return aStart - bStart;
      });

      // Identifier les créneaux libres
      const workingHours = {
        start: 8, // 8h
        end: 20   // 20h
      };

      const slots = [];
      let currentTime = new Date(startOfDay);
      currentTime.setHours(workingHours.start, 0, 0, 0);

      const endTime = new Date(startOfDay);
      endTime.setHours(workingHours.end, 0, 0, 0);

      for (const event of allEvents) {
        const eventStart = new Date(event.start.dateTime || event.start.date);
        const eventEnd = new Date(event.end.dateTime || event.end.date);

        // Si il y a un gap avant cet événement
        if (eventStart > currentTime) {
          const slotDuration = (eventStart - currentTime) / (1000 * 60); // en minutes
          if (slotDuration >= duration) {
            slots.push({
              start: new Date(currentTime),
              end: new Date(eventStart),
              duration: slotDuration
            });
          }
        }

        // Avancer le curseur après cet événement
        if (eventEnd > currentTime) {
          currentTime = new Date(eventEnd);
        }
      }

      // Vérifier s'il reste du temps libre après le dernier événement
      if (currentTime < endTime) {
        const finalSlotDuration = (endTime - currentTime) / (1000 * 60);
        if (finalSlotDuration >= duration) {
          slots.push({
            start: new Date(currentTime),
            end: new Date(endTime),
            duration: finalSlotDuration
          });
        }
      }

      logger.info(`${slots.length} créneaux disponibles trouvés pour le ${date.toDateString()}`);
      return slots;
    } catch (error) {
      logger.error('Erreur lors de l\'analyse des créneaux disponibles:', error.message);
      throw error;
    }
  }

  // Détection des conflits
  async detectConflicts(calendarIds, newEvent) {
    try {
      const conflicts = [];

      for (const calendarId of calendarIds) {
        const existingEvents = await this.getEvents(
          calendarId,
          new Date(newEvent.start.dateTime),
          new Date(newEvent.end.dateTime)
        );

        for (const event of existingEvents) {
          const eventStart = new Date(event.start.dateTime || event.start.date);
          const eventEnd = new Date(event.end.dateTime || event.end.date);
          const newStart = new Date(newEvent.start.dateTime);
          const newEnd = new Date(newEvent.end.dateTime);

          // Vérifier le chevauchement
          if (newStart < eventEnd && newEnd > eventStart) {
            conflicts.push({
              calendarId,
              event,
              conflictType: this.getConflictType(newStart, newEnd, eventStart, eventEnd)
            });
          }
        }
      }

      if (conflicts.length > 0) {
        logger.warn(`${conflicts.length} conflits détectés pour le nouvel événement`);
      }

      return conflicts;
    } catch (error) {
      logger.error('Erreur lors de la détection des conflits:', error.message);
      throw error;
    }
  }

  getConflictType(newStart, newEnd, eventStart, eventEnd) {
    if (newStart >= eventStart && newEnd <= eventEnd) {
      return 'enclosed'; // Complètement inclus
    } else if (newStart <= eventStart && newEnd >= eventEnd) {
      return 'enclosing'; // Englobe complètement
    } else if (newStart < eventStart && newEnd > eventStart) {
      return 'overlap_start'; // Chevauche le début
    } else if (newStart < eventEnd && newEnd > eventEnd) {
      return 'overlap_end'; // Chevauche la fin
    }
    return 'partial'; // Chevauchement partiel
  }

  // Synchronisation bidirectionnelle
  async syncTaskToCalendar(task, calendarId, options = {}) {
    try {
      const eventData = this.convertTaskToEvent(task, options);

      // Vérifier les conflits si demandé
      if (options.checkConflicts) {
        const conflicts = await this.detectConflicts([calendarId], eventData);
        if (conflicts.length > 0) {
          logger.warn(`Synchronisation interrompue: conflits détectés pour la tâche ${task.title}`);
          return { success: false, conflicts };
        }
      }

      const event = await this.createEvent(calendarId, eventData);

      logger.info(`Tâche synchronisée vers calendrier: ${task.title}`);
      return { success: true, event };
    } catch (error) {
      logger.error(`Erreur lors de la synchronisation de la tâche ${task.title}:`, error.message);
      throw error;
    }
  }

  convertTaskToEvent(task, options = {}) {
    const eventData = {
      summary: task.title,
      description: task.content || '',
      start: {},
      end: {},
      reminders: {
        useDefault: false,
        overrides: []
      }
    };

    // Gestion des dates
    if (task.dueDate) {
      const dueDate = new Date(task.dueDate);

      if (task.allDay || !task.startDate) {
        // Événement sur toute la journée
        eventData.start.date = dueDate.toISOString().split('T')[0];
        eventData.end.date = dueDate.toISOString().split('T')[0];
      } else {
        // Événement avec heure
        eventData.start.dateTime = new Date(task.startDate).toISOString();
        eventData.end.dateTime = dueDate.toISOString();
        eventData.start.timeZone = config.scheduler.timezone;
        eventData.end.timeZone = config.scheduler.timezone;
      }
    }

    // Options supplémentaires
    if (options.color) {
      eventData.colorId = options.color;
    }

    if (options.reminders === false) {
      eventData.reminders = {
        useDefault: false,
        overrides: []
      };
    }

    return eventData;
  }

  // Obtenir les calendriers disponibles
  async getCalendars() {
    try {
      const response = await this.calendar.calendarList.list();
      return response.data.items;
    } catch (error) {
      logger.error('Erreur lors de la récupération des calendriers:', error.message);
      throw error;
    }
  }

  // Vérification de l'état de la connexion
  async checkConnection() {
    try {
      await this.calendar.calendarList.list();
      return true;
    } catch (error) {
      logger.error('Connexion Google Calendar échouée:', error.message);
      return false;
    }
  }
}

module.exports = GoogleCalendarAPI;
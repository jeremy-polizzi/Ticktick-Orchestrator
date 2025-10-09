const GoogleCalendarAPI = require('../api/google-calendar-api');
const TickTickAPI = require('../api/ticktick-api');
const AirtableAPI = require('../api/airtable-api');
const CalendarCleaner = require('./calendar-cleaner');
const logger = require('../utils/logger');
const config = require('../config/config');

class CommandProcessor {
  constructor() {
    this.googleCalendar = new GoogleCalendarAPI();
    this.ticktick = new TickTickAPI();
    this.airtable = new AirtableAPI();
    this.cleaner = new CalendarCleaner();

    // Historique des actions pour UNDO
    this.actionHistory = [];
    this.maxHistorySize = 50;
  }

  async initialize() {
    try {
      await this.googleCalendar.loadTokens();
      await this.ticktick.loadTokens();
      await this.airtable.initialize();
      await this.cleaner.initialize();

      logger.info('CommandProcessor initialisé avec succès');
      return true;
    } catch (error) {
      logger.error('Erreur lors de l\'initialisation du CommandProcessor:', error.message);
      return false;
    }
  }

  // === TRAITEMENT COMMANDE EN LANGAGE NATUREL ===

  async processCommand(command) {
    try {
      const normalizedCommand = command.toLowerCase().trim();

      logger.info(`📝 Commande reçue: "${command}"`);

      // Détecter le type de commande
      const commandType = this.detectCommandType(normalizedCommand);

      let result = null;

      switch (commandType.type) {
        case 'delete':
          result = await this.handleDelete(normalizedCommand, commandType);
          break;

        case 'cleanup':
          result = await this.handleCleanup(normalizedCommand);
          break;

        case 'undo':
          result = await this.handleUndo();
          break;

        case 'move':
          result = await this.handleMove(normalizedCommand, commandType);
          break;

        case 'postpone':
          result = await this.handlePostpone(normalizedCommand, commandType);
          break;

        case 'create':
          result = await this.handleCreate(normalizedCommand, commandType);
          break;

        case 'complete':
          result = await this.handleComplete(normalizedCommand, commandType);
          break;

        case 'search':
          result = await this.handleSearch(normalizedCommand, commandType);
          break;

        case 'block':
          result = await this.handleBlock(normalizedCommand, commandType);
          break;

        case 'priority':
          result = await this.handlePriority(normalizedCommand, commandType);
          break;

        case 'relance':
          result = await this.handleRelance(normalizedCommand, commandType);
          break;

        case 'suggest':
          result = await this.handleSuggest(normalizedCommand);
          break;

        default:
          result = {
            success: false,
            message: 'Commande non reconnue. Tapez "aide" pour voir les commandes disponibles.',
            suggestions: this.getSuggestions(normalizedCommand)
          };
      }

      // Sauvegarder dans l'historique (sauf undo et search)
      if (result.success && commandType.type !== 'undo' && commandType.type !== 'search') {
        this.saveToHistory({
          command,
          type: commandType.type,
          result,
          timestamp: new Date()
        });
      }

      return result;

    } catch (error) {
      logger.error('Erreur lors du traitement de la commande:', error.message);
      return {
        success: false,
        message: `Erreur: ${error.message}`
      };
    }
  }

  // === DÉTECTION TYPE DE COMMANDE ===

  detectCommandType(command) {
    // Supprimer / Effacer / Delete
    if (command.match(/supprime|efface|delete|retire|enlève|vire/)) {
      return {
        type: 'delete',
        target: this.extractTarget(command)
      };
    }

    // Nettoyer / Clean
    if (command.match(/nettoie|clean|purge|range/)) {
      return { type: 'cleanup' };
    }

    // Annuler / Undo
    if (command.match(/annule|undo|retour|revenir|annuler/)) {
      return { type: 'undo' };
    }

    // Déplacer / Move
    if (command.match(/déplace|bouge|move|change.*heure|change.*date/)) {
      return {
        type: 'move',
        target: this.extractTarget(command),
        when: this.extractWhen(command)
      };
    }

    // Reporter / Postpone
    if (command.match(/reporte|décale|postpone|plus tard|demain|semaine prochaine/)) {
      return {
        type: 'postpone',
        target: this.extractTarget(command),
        delay: this.extractDelay(command)
      };
    }

    // Créer / Add
    if (command.match(/crée|ajoute|créer|add|nouveau|nouvelle/)) {
      return {
        type: 'create',
        what: this.extractWhat(command),
        when: this.extractWhen(command)
      };
    }

    // Terminer / Complete
    if (command.match(/termine|fini|complète|marque.*terminé|done/)) {
      return {
        type: 'complete',
        target: this.extractTarget(command)
      };
    }

    // Rechercher / Search
    if (command.match(/cherche|trouve|search|liste|affiche/)) {
      return {
        type: 'search',
        query: this.extractQuery(command)
      };
    }

    // Bloquer créneau / Block
    if (command.match(/bloque|réserve|focus|concentration/)) {
      return {
        type: 'block',
        when: this.extractWhen(command),
        duration: this.extractDuration(command)
      };
    }

    // Priorité
    if (command.match(/priorité|urgent|important/)) {
      return {
        type: 'priority',
        target: this.extractTarget(command),
        level: this.extractPriorityLevel(command)
      };
    }

    // Relancer prospect
    if (command.match(/relance|rappel|contact.*prospect|appel/)) {
      return {
        type: 'relance',
        target: this.extractTarget(command)
      };
    }

    // Suggérer / Suggest
    if (command.match(/suggère|propose|optimise|réorganise|améliore/)) {
      return { type: 'suggest' };
    }

    return { type: 'unknown' };
  }

  // === HANDLERS ===

  async handleDelete(command, commandType) {
    const target = commandType.target;

    if (!target) {
      return {
        success: false,
        message: 'Veuillez préciser ce que vous voulez supprimer (ex: "supprime la tâche X")'
      };
    }

    // Déterminer si c'est TickTick ou Google Calendar
    const isTickTick = command.includes('tâche') || command.includes('ticktick');
    const isGoogleCal = command.includes('événement') || command.includes('agenda') || command.includes('calendar');

    let deleted = [];

    // Chercher dans TickTick
    if (isTickTick || !isGoogleCal) {
      const tasks = await this.ticktick.getTasks();
      const matchingTasks = tasks.filter(task =>
        task.title.toLowerCase().includes(target.toLowerCase())
      );

      for (const task of matchingTasks) {
        await this.ticktick.deleteTask(task.id);
        deleted.push({ type: 'ticktick', item: task });
        logger.info(`Tâche TickTick supprimée: "${task.title}"`);
      }
    }

    // Chercher dans Google Calendar
    if (isGoogleCal || !isTickTick) {
      const calendarIds = [config.calendars.jeremy, config.calendars.business];
      const now = new Date();
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + 30);

      for (const calendarId of calendarIds) {
        const events = await this.googleCalendar.getEvents(calendarId, now, endDate);
        const matchingEvents = events.filter(event =>
          (event.summary || '').toLowerCase().includes(target.toLowerCase())
        );

        for (const event of matchingEvents) {
          await this.googleCalendar.deleteEvent(calendarId, event.id);
          deleted.push({ type: 'calendar', calendarId, item: event });
          logger.info(`Événement Google Calendar supprimé: "${event.summary}"`);
        }
      }
    }

    if (deleted.length === 0) {
      return {
        success: false,
        message: `Aucun élément trouvé correspondant à "${target}"`
      };
    }

    return {
      success: true,
      message: `${deleted.length} élément(s) supprimé(s)`,
      deleted,
      undoable: true
    };
  }

  async handleCleanup(command) {
    logger.info('🧹 Nettoyage manuel déclenché via commande');

    const report = await this.cleaner.performCleanup();

    return {
      success: true,
      message: `Nettoyage terminé - ${report.fixed} corrections effectuées`,
      report
    };
  }

  async handleUndo() {
    if (this.actionHistory.length === 0) {
      return {
        success: false,
        message: 'Aucune action à annuler'
      };
    }

    const lastAction = this.actionHistory.pop();

    logger.info(`⏮️ Annulation de l'action: ${lastAction.type}`);

    // Annuler selon le type
    if (lastAction.type === 'delete' && lastAction.result.deleted) {
      // Recréer les éléments supprimés
      for (const item of lastAction.result.deleted) {
        if (item.type === 'ticktick') {
          // Recréer la tâche TickTick
          await this.ticktick.createTask({
            title: item.item.title,
            content: item.item.content,
            dueDate: item.item.dueDate,
            priority: item.item.priority
          });
        } else if (item.type === 'calendar') {
          // Recréer l'événement Google Calendar
          await this.googleCalendar.createEvent(item.calendarId, {
            summary: item.item.summary,
            description: item.item.description,
            start: item.item.start,
            end: item.item.end
          });
        }
      }

      return {
        success: true,
        message: `Action annulée - ${lastAction.result.deleted.length} élément(s) restauré(s)`
      };
    }

    return {
      success: false,
      message: 'Cette action ne peut pas être annulée'
    };
  }

  async handleMove(command, commandType) {
    // TODO: Implémenter déplacement
    return {
      success: false,
      message: 'Fonctionnalité "déplacer" en cours de développement'
    };
  }

  async handlePostpone(command, commandType) {
    // TODO: Implémenter report
    return {
      success: false,
      message: 'Fonctionnalité "reporter" en cours de développement'
    };
  }

  async handleCreate(command, commandType) {
    // TODO: Implémenter création rapide
    return {
      success: false,
      message: 'Fonctionnalité "créer" en cours de développement'
    };
  }

  async handleComplete(command, commandType) {
    // TODO: Implémenter marquage terminé
    return {
      success: false,
      message: 'Fonctionnalité "terminer" en cours de développement'
    };
  }

  async handleSearch(command, commandType) {
    // TODO: Implémenter recherche
    return {
      success: false,
      message: 'Fonctionnalité "rechercher" en cours de développement'
    };
  }

  async handleBlock(command, commandType) {
    // TODO: Implémenter blocage créneau
    return {
      success: false,
      message: 'Fonctionnalité "bloquer créneau" en cours de développement'
    };
  }

  async handlePriority(command, commandType) {
    // TODO: Implémenter changement priorité
    return {
      success: false,
      message: 'Fonctionnalité "priorité" en cours de développement'
    };
  }

  async handleRelance(command, commandType) {
    // TODO: Implémenter relance prospect
    return {
      success: false,
      message: 'Fonctionnalité "relance" en cours de développement'
    };
  }

  async handleSuggest(command) {
    // TODO: Implémenter suggestions IA
    return {
      success: false,
      message: 'Fonctionnalité "suggestions" en cours de développement'
    };
  }

  // === EXTRACTION DE DONNÉES ===

  extractTarget(command) {
    // Extraire le nom de la tâche/événement
    const patterns = [
      /(?:tâche|événement|event|task)\s+["']?(.+?)["']?(?:\s|$)/i,
      /["'](.+?)["']/,
      /(?:appelée?|nommée?)\s+(.+)/i
    ];

    for (const pattern of patterns) {
      const match = command.match(pattern);
      if (match) return match[1].trim();
    }

    // Fallback: prendre le dernier mot/groupe
    const words = command.split(' ');
    return words[words.length - 1];
  }

  extractWhen(command) {
    if (command.includes('demain')) return 'tomorrow';
    if (command.includes('semaine prochaine')) return 'next_week';
    if (command.includes('mois prochain')) return 'next_month';
    return null;
  }

  extractDelay(command) {
    if (command.includes('demain')) return { days: 1 };
    if (command.includes('semaine')) return { days: 7 };
    if (command.includes('mois')) return { days: 30 };
    return { days: 1 };
  }

  extractWhat(command) {
    // TODO: Extraire ce qu'on veut créer
    return null;
  }

  extractQuery(command) {
    // TODO: Extraire la requête de recherche
    return null;
  }

  extractDuration(command) {
    const match = command.match(/(\d+)\s*(heure|h|minute|min)/i);
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      return unit.startsWith('h') ? value * 60 : value;
    }
    return 60; // 1h par défaut
  }

  extractPriorityLevel(command) {
    if (command.includes('urgent') || command.includes('critique')) return 'high';
    if (command.includes('important')) return 'medium';
    if (command.includes('faible') || command.includes('basse')) return 'low';
    return 'medium';
  }

  getSuggestions(command) {
    return [
      'Supprime la tâche "Nom de la tâche"',
      'Nettoie l\'agenda',
      'Annule la dernière action',
      'Déplace l\'événement "X" à demain',
      'Reporte la tâche "Y" à la semaine prochaine'
    ];
  }

  // === HISTORIQUE ===

  saveToHistory(action) {
    this.actionHistory.push(action);

    // Limiter la taille de l'historique
    if (this.actionHistory.length > this.maxHistorySize) {
      this.actionHistory.shift();
    }
  }

  getHistory(limit = 10) {
    return this.actionHistory.slice(-limit).reverse();
  }

  // === AIDE ===

  getHelpText() {
    return `
🤖 COMMANDES DISPONIBLES:

📝 GESTION TÂCHES/ÉVÉNEMENTS:
• "Supprime la tâche X" - Supprimer une tâche
• "Supprime l'événement Y dans l'agenda" - Supprimer événement
• "Termine la tâche Z" - Marquer comme terminé
• "Cherche la tâche A" - Rechercher

🔄 ORGANISATION:
• "Déplace l'événement X à demain" - Déplacer
• "Reporte la tâche Y à la semaine prochaine" - Reporter
• "Nettoie l'agenda" - Nettoyage automatique

⏮️ ANNULATION:
• "Annule" - Annuler la dernière action

🎯 CRÉATION RAPIDE:
• "Crée une tâche X demain à 14h"
• "Bloque 2h cet après-midi pour focus"

📊 CRM CAP NUMÉRIQUE:
• "Relance le prospect X"
• "Liste les prospects à relancer"

💡 SUGGESTIONS:
• "Suggère une réorganisation"
• "Optimise ma journée"

🔍 RECHERCHE:
• "Trouve toutes les tâches urgentes"
• "Affiche mon agenda de demain"
    `.trim();
  }
}

module.exports = CommandProcessor;

const AirtableAPI = require('../api/airtable-api');
const TickTickAPI = require('../api/ticktick-api');
const GoogleCalendarAPI = require('../api/google-calendar-api');
const PriorityCalculator = require('./priority-calculator');
const logger = require('../utils/logger');
const config = require('../config/config');

/**
 * Smart Orchestrator - Intelligence automatique basée sur Airtable
 *
 * MISSION: Analyser le CRM Cap Numérique et générer des actions automatiquement
 * pour atteindre l'objectif de 20-50k€/mois
 */
class SmartOrchestrator {
  constructor() {
    this.airtable = new AirtableAPI();
    this.ticktick = new TickTickAPI();
    this.googleCalendar = new GoogleCalendarAPI();
    this.priorityCalculator = new PriorityCalculator();

    // Objectifs financiers (depuis user-profile.json)
    this.objectifs = {
      mensuel: 20000,
      stretch: 50000,
      commissionParDossier: 640,
      dossiersRequis: 31, // 20000 / 640 = 31.25
      revenuActuel: 0
    };

    this.lastAnalysis = null;
    this.suggestionsGenerated = [];
  }

  async initialize() {
    try {
      await this.airtable.initialize();
      await this.ticktick.loadTokens();
      await this.googleCalendar.loadTokens();

      logger.info('SmartOrchestrator initialisé avec succès');
      return true;
    } catch (error) {
      logger.error('Erreur lors de l\'initialisation du SmartOrchestrator:', error.message);
      return false;
    }
  }

  // === ANALYSE AUTOMATIQUE QUOTIDIENNE ===

  async performDailyAnalysis() {
    try {
      logger.info('🧠 Début de l\'analyse intelligente quotidienne');

      const startTime = Date.now();

      // 1. Analyser Airtable
      const airtableData = await this.analyzeAirtable();

      // 2. Détecter actions requises
      const actions = await this.detectRequiredActions(airtableData);

      // 3. Générer tâches TickTick automatiquement
      const generatedTasks = await this.generateAutomaticTasks(actions);

      // 4. Bloquer créneaux dans Google Calendar
      const blockedSlots = await this.blockCalendarSlots(actions);

      // 5. Calculer progression objectif
      const progression = this.calculateObjectiveProgress(airtableData);

      // 6. Générer suggestions proactives
      const suggestions = await this.generateProactiveSuggestions(airtableData, progression);

      const duration = Date.now() - startTime;

      this.lastAnalysis = {
        timestamp: new Date(),
        airtableData,
        actions,
        generatedTasks,
        blockedSlots,
        progression,
        suggestions,
        duration
      };

      logger.info(`✅ Analyse terminée en ${duration}ms - ${generatedTasks.length} tâches générées, ${suggestions.length} suggestions`);

      return this.lastAnalysis;

    } catch (error) {
      logger.error('Erreur lors de l\'analyse quotidienne:', error.message);
      throw error;
    }
  }

  // === ANALYSE AIRTABLE ===

  async analyzeAirtable() {
    try {
      const prospects = await this.airtable.getProspects();
      const stats = await this.airtable.getCapNumeriqueStats();

      // Analyser chaque prospect
      const analysis = {
        total: prospects.length,
        parStatut: stats.parStatut,

        // Prospects à relancer (>3j sans contact)
        aRelancer: [],

        // Dossiers validables (documents reçus)
        validables: [],

        // Documents en attente
        documentsEnAttente: [],

        // Signatures en attente (>7j)
        signaturesEnAttente: [],

        // Non contactés
        nonContactes: [],

        // Stats financières
        revenuGenere: stats.revenuGenere,
        revenuPotentiel: stats.revenuPotentiel,
        dossiersValides: stats.valides,
        dossiersEnCours: stats.enCours
      };

      const now = new Date();

      prospects.forEach(prospect => {
        const fields = prospect.fields;
        const statut = fields['Statut'] || '';
        const derniereModif = fields['Dernière modification'] ? new Date(fields['Dernière modification']) : null;

        // Non contacté
        if (statut === 'Non contacté') {
          analysis.nonContactes.push({
            id: prospect.id,
            nom: `${fields['Prénom'] || ''} ${fields['Nom'] || ''}`.trim(),
            telephone: fields['Téléphone'],
            objectif: fields['Objectif'],
            societe: fields['Société']
          });
        }

        // À relancer (>3j sans modification)
        if (derniereModif && statut !== 'Validé') {
          const joursSansContact = Math.floor((now - derniereModif) / (1000 * 60 * 60 * 24));

          if (joursSansContact >= 3) {
            analysis.aRelancer.push({
              id: prospect.id,
              nom: `${fields['Prénom'] || ''} ${fields['Nom'] || ''}`.trim(),
              telephone: fields['Téléphone'],
              joursSansContact,
              statut,
              urgence: joursSansContact >= 7 ? 'HAUTE' : 'MOYENNE'
            });
          }
        }

        // Documents en attente
        if (statut.includes('Documents') || statut.includes('En attente')) {
          analysis.documentsEnAttente.push({
            id: prospect.id,
            nom: `${fields['Prénom'] || ''} ${fields['Nom'] || ''}`.trim(),
            statut
          });
        }

        // Validable si "En cours" depuis >7j
        if (statut.includes('En cours') && derniereModif) {
          const joursEnCours = Math.floor((now - derniereModif) / (1000 * 60 * 60 * 24));

          if (joursEnCours >= 7) {
            analysis.validables.push({
              id: prospect.id,
              nom: `${fields['Prénom'] || ''} ${fields['Nom'] || ''}`.trim(),
              joursEnCours,
              revenuPotentiel: 640
            });
          }
        }
      });

      logger.info(`Analyse Airtable: ${analysis.aRelancer.length} à relancer, ${analysis.nonContactes.length} non contactés, ${analysis.validables.length} validables`);

      return analysis;

    } catch (error) {
      logger.error('Erreur lors de l\'analyse Airtable:', error.message);
      throw error;
    }
  }

  // === DÉTECTION ACTIONS REQUISES ===

  async detectRequiredActions(airtableData) {
    const actions = [];

    // ACTION 1: Session appels prospects à relancer
    if (airtableData.aRelancer.length > 0) {
      actions.push({
        type: 'session_appels',
        priority: 'CRITICAL',
        titre: `Session appels prospects - ${airtableData.aRelancer.length} à relancer`,
        description: `Relancer ${airtableData.aRelancer.length} prospects sans contact depuis 3-7 jours`,
        prospects: airtableData.aRelancer,
        duree: Math.min(120, airtableData.aRelancer.length * 10), // 10min/prospect, max 2h
        revenuPotentiel: airtableData.aRelancer.length * 640,
        when: 'morning' // Matin = énergie max
      });
    }

    // ACTION 2: Contacter non contactés
    if (airtableData.nonContactes.length > 0) {
      actions.push({
        type: 'premiers_contacts',
        priority: 'HIGH',
        titre: `Premiers contacts - ${airtableData.nonContactes.length} prospects neufs`,
        description: `Contacter ${airtableData.nonContactes.length} nouveaux prospects`,
        prospects: airtableData.nonContactes,
        duree: Math.min(120, airtableData.nonContactes.length * 10),
        revenuPotentiel: airtableData.nonContactes.length * 640,
        when: 'morning'
      });
    }

    // ACTION 3: Finaliser dossiers validables
    if (airtableData.validables.length > 0) {
      airtableData.validables.forEach(dossier => {
        actions.push({
          type: 'finaliser_dossier',
          priority: 'CRITICAL',
          titre: `Finaliser dossier ${dossier.nom}`,
          description: `Dossier en cours depuis ${dossier.joursEnCours} jours - vérifier éligibilité et soumettre`,
          prospect: dossier,
          duree: 30,
          revenuPotentiel: 640,
          when: 'afternoon'
        });
      });
    }

    // ACTION 4: Relancer documents en attente
    if (airtableData.documentsEnAttente.length > 5) {
      actions.push({
        type: 'relances_documents',
        priority: 'HIGH',
        titre: `Relancer ${airtableData.documentsEnAttente.length} documents en attente`,
        description: `Envoyer messages WhatsApp pour documents manquants`,
        prospects: airtableData.documentsEnAttente,
        duree: 45,
        when: 'afternoon'
      });
    }

    logger.info(`${actions.length} actions détectées automatiquement`);

    return actions;
  }

  // === GÉNÉRATION AUTOMATIQUE TÂCHES ===

  async generateAutomaticTasks(actions) {
    const generatedTasks = [];

    try {
      for (const action of actions) {
        // Vérifier si tâche similaire existe déjà
        const existingTasks = await this.ticktick.getTasks();
        const alreadyExists = existingTasks.some(task =>
          task.title.toLowerCase().includes(action.titre.toLowerCase().substring(0, 20))
        );

        if (alreadyExists) {
          logger.debug(`Tâche similaire déjà existante: "${action.titre}"`);
          continue;
        }

        // Créer la tâche dans TickTick
        const taskData = {
          title: action.titre,
          content: this.buildTaskContent(action),
          priority: action.priority === 'CRITICAL' ? 5 : action.priority === 'HIGH' ? 3 : 1,
          tags: ['#cap-numerique', '#auto-generated'],
          dueDate: new Date().toISOString().split('T')[0], // Aujourd'hui
          timeEstimate: action.duree
        };

        const createdTask = await this.ticktick.createTask(taskData);

        generatedTasks.push({
          action: action.type,
          task: createdTask,
          revenuPotentiel: action.revenuPotentiel
        });

        logger.info(`✅ Tâche générée: "${action.titre}" (${action.duree}min, ${action.revenuPotentiel}€ potentiel)`);
      }

      return generatedTasks;

    } catch (error) {
      logger.error('Erreur lors de la génération des tâches:', error.message);
      return generatedTasks;
    }
  }

  buildTaskContent(action) {
    let content = `${action.description}\n\n`;

    if (action.prospects && action.prospects.length > 0) {
      content += `📋 LISTE (${action.prospects.length}):\n`;
      action.prospects.slice(0, 10).forEach((prospect, index) => {
        content += `${index + 1}. ${prospect.nom}`;
        if (prospect.telephone) content += ` - ${prospect.telephone}`;
        if (prospect.urgence) content += ` [${prospect.urgence}]`;
        if (prospect.joursSansContact) content += ` (${prospect.joursSansContact}j sans contact)`;
        content += '\n';
      });

      if (action.prospects.length > 10) {
        content += `... et ${action.prospects.length - 10} autres\n`;
      }
    }

    content += `\n💰 Revenu potentiel: ${action.revenuPotentiel}€`;
    content += `\n⏱️ Durée estimée: ${action.duree} minutes`;
    content += `\n🤖 Générée automatiquement par SmartOrchestrator`;

    return content;
  }

  // === BLOCAGE CRÉNEAUX CALENDRIER ===

  async blockCalendarSlots(actions) {
    const blockedSlots = [];

    try {
      const calendarId = config.calendars.jeremy;

      for (const action of actions) {
        // Ne bloquer que les sessions (pas les tâches individuelles)
        if (!action.type.includes('session')) continue;

        // Trouver créneau optimal selon "when"
        const targetDate = new Date();
        const slots = await this.googleCalendar.getAvailableSlots(
          [calendarId],
          targetDate,
          action.duree,
          {
            bufferMinutes: 15,
            excludeMorning: action.when === 'afternoon',
            morningEndHour: 12
          }
        );

        if (slots.length === 0) {
          logger.warn(`Aucun créneau disponible pour ${action.titre}`);
          continue;
        }

        // Prendre le premier créneau
        const slot = slots[0];
        const start = new Date(slot.start);
        const end = new Date(start.getTime() + action.duree * 60 * 1000);

        // Créer événement
        const event = await this.googleCalendar.createEvent(calendarId, {
          summary: `🔥 ${action.titre}`,
          description: action.description + '\n\n💰 Revenu potentiel: ' + action.revenuPotentiel + '€',
          start: {
            dateTime: start.toISOString(),
            timeZone: config.scheduler.timezone
          },
          end: {
            dateTime: end.toISOString(),
            timeZone: config.scheduler.timezone
          },
          colorId: '11', // Rouge = haute priorité
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 15 }
            ]
          }
        });

        blockedSlots.push({
          action: action.type,
          event,
          start,
          end
        });

        logger.info(`✅ Créneau bloqué: ${start.toLocaleTimeString('fr-FR')} - ${end.toLocaleTimeString('fr-FR')} pour "${action.titre}"`);
      }

      return blockedSlots;

    } catch (error) {
      logger.error('Erreur lors du blocage des créneaux:', error.message);
      return blockedSlots;
    }
  }

  // === CALCUL PROGRESSION OBJECTIF ===

  calculateObjectiveProgress(airtableData) {
    const progression = {
      objectifMensuel: this.objectifs.mensuel,
      revenuActuel: airtableData.revenuGenere,
      revenuPotentiel: airtableData.revenuPotentiel,
      pourcentageAtteint: Math.round((airtableData.revenuGenere / this.objectifs.mensuel) * 100),
      dossiersValides: airtableData.dossiersValides,
      dossiersEnCours: airtableData.dossiersEnCours,
      dossiersRequis: this.objectifs.dossiersRequis,
      dossiersRestants: this.objectifs.dossiersRequis - airtableData.dossiersValides,

      // Calculs journaliers
      joursDansLeMois: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(),
      joursEcoules: new Date().getDate(),
      joursRestants: null,
      objectifJournalier: null,
      retard: null
    };

    progression.joursRestants = progression.joursDansLeMois - progression.joursEcoules;
    progression.objectifJournalier = Math.round(progression.objectifMensuel / progression.joursDansLeMois);

    const objectifAttendu = progression.objectifJournalier * progression.joursEcoules;
    progression.retard = objectifAttendu - progression.revenuActuel;

    return progression;
  }

  // === SUGGESTIONS PROACTIVES ===

  async generateProactiveSuggestions(airtableData, progression) {
    const suggestions = [];

    // SUGGESTION 1: Urgence si retard objectif
    if (progression.retard > 5000) {
      suggestions.push({
        type: 'urgence_objectif',
        priority: 'CRITICAL',
        titre: `🚨 Retard de ${progression.retard}€ sur l'objectif`,
        message: `Tu es en retard de ${progression.retard}€ sur ton objectif mensuel. Il te faut valider ${Math.ceil(progression.retard / 640)} dossiers rapidement.`,
        action: 'Prioriser finalisation des dossiers en cours'
      });
    }

    // SUGGESTION 2: Dossiers validables
    if (airtableData.validables.length > 0) {
      const revenuImmediat = airtableData.validables.length * 640;
      suggestions.push({
        type: 'quick_win',
        priority: 'HIGH',
        titre: `💰 ${revenuImmediat}€ à portée de main`,
        message: `${airtableData.validables.length} dossiers sont validables. Finalise-les aujourd'hui pour générer ${revenuImmediat}€.`,
        action: `Bloquer 1h cet après-midi pour finaliser ${airtableData.validables.length} dossiers`
      });
    }

    // SUGGESTION 3: Temps libre inutilisé
    const calendar = await this.googleCalendar.getEvents(
      config.calendars.jeremy,
      new Date(),
      new Date(Date.now() + 24 * 60 * 60 * 1000)
    );

    const heuresLibres = this.calculateFreeHours(calendar);

    if (heuresLibres > 3 && airtableData.aRelancer.length > 5) {
      suggestions.push({
        type: 'optimisation_temps',
        priority: 'MEDIUM',
        titre: `⏰ ${heuresLibres}h libres aujourd'hui`,
        message: `Tu as ${heuresLibres}h de temps libre. ${airtableData.aRelancer.length} prospects attendent. Session intensive ?`,
        action: `Bloquer 2h pour appeler tous les prospects en attente`
      });
    }

    // SUGGESTION 4: Rythme insuffisant
    const dossiersParJour = progression.dossiersValides / progression.joursEcoules;
    const rythmeRequis = progression.dossiersRequis / progression.joursDansLeMois;

    if (dossiersParJour < rythmeRequis) {
      suggestions.push({
        type: 'acceleration_requise',
        priority: 'HIGH',
        titre: `📈 Rythme insuffisant`,
        message: `Tu valides ${dossiersParJour.toFixed(1)} dossiers/jour. Il faut ${rythmeRequis.toFixed(1)}/jour pour atteindre 20k€.`,
        action: `Augmenter le nombre d'appels quotidiens de ${Math.ceil((rythmeRequis - dossiersParJour) * 3)}`
      });
    }

    this.suggestionsGenerated = suggestions;

    logger.info(`${suggestions.length} suggestions générées`);

    return suggestions;
  }

  calculateFreeHours(events) {
    // Calculer heures libres dans la journée (8h-20h)
    const workStart = 8;
    const workEnd = 20;
    const totalWorkHours = workEnd - workStart;

    let busyMinutes = 0;

    events.forEach(event => {
      if (event.start.dateTime && event.end.dateTime) {
        const start = new Date(event.start.dateTime);
        const end = new Date(event.end.dateTime);
        const duration = (end - start) / (1000 * 60);
        busyMinutes += duration;
      }
    });

    const freeMinutes = (totalWorkHours * 60) - busyMinutes;
    return Math.floor(freeMinutes / 60);
  }

  // === RAPPORT DASHBOARD ===

  async getDashboardData() {
    if (!this.lastAnalysis) {
      await this.performDailyAnalysis();
    }

    return {
      timestamp: this.lastAnalysis.timestamp,

      // Objectif financier
      objectif: {
        mensuel: this.objectifs.mensuel,
        revenuActuel: this.lastAnalysis.airtableData.revenuGenere,
        revenuPotentiel: this.lastAnalysis.airtableData.revenuPotentiel,
        pourcentage: this.lastAnalysis.progression.pourcentageAtteint,
        dossiersValides: this.lastAnalysis.airtableData.dossiersValides,
        dossiersRequis: this.objectifs.dossiersRequis,
        retard: this.lastAnalysis.progression.retard
      },

      // Actions urgentes
      actionsUrgentes: this.lastAnalysis.actions.filter(a => a.priority === 'CRITICAL'),

      // Stats Airtable
      prospects: {
        total: this.lastAnalysis.airtableData.total,
        aRelancer: this.lastAnalysis.airtableData.aRelancer.length,
        nonContactes: this.lastAnalysis.airtableData.nonContactes.length,
        validables: this.lastAnalysis.airtableData.validables.length,
        documentsEnAttente: this.lastAnalysis.airtableData.documentsEnAttente.length
      },

      // Tâches générées
      tachesGenerees: this.lastAnalysis.generatedTasks.length,

      // Suggestions
      suggestions: this.lastAnalysis.suggestions,

      // Détails
      details: this.lastAnalysis.airtableData
    };
  }

  // === SYNCHRONISATION TICKTICK → AIRTABLE ===

  async syncCompletedTasksToAirtable() {
    try {
      // Récupérer tâches complétées aujourd'hui
      const allTasks = await this.ticktick.getTasks({ completed: true });
      const today = new Date().toISOString().split('T')[0];

      const completedToday = allTasks.filter(task => {
        if (!task.completedTime) return false;
        const completedDate = new Date(task.completedTime).toISOString().split('T')[0];
        return completedDate === today && task.tags && task.tags.includes('#cap-numerique');
      });

      logger.info(`${completedToday.length} tâches Cap Numérique complétées aujourd'hui`);

      // Mettre à jour Airtable pour chaque tâche
      for (const task of completedToday) {
        // Extraire le nom du prospect depuis le titre ou contenu
        const prospectName = this.extractProspectName(task);

        if (prospectName) {
          // Chercher dans Airtable
          const prospects = await this.airtable.getProspects();
          const matching = prospects.find(p => {
            const fullName = `${p.fields['Prénom'] || ''} ${p.fields['Nom'] || ''}`.trim();
            return fullName.toLowerCase().includes(prospectName.toLowerCase());
          });

          if (matching) {
            // Mettre à jour "Dernier contact"
            await this.airtable.updateRecord('tbl6NXwfDg7ZtYE7a', matching.id, {
              'Dernière modification': new Date().toISOString(),
              'Statut': 'Contacté'
            });

            logger.info(`✅ Airtable mis à jour: ${prospectName} - Dernier contact = aujourd'hui`);
          }
        }
      }

    } catch (error) {
      logger.error('Erreur lors de la sync TickTick → Airtable:', error.message);
    }
  }

  extractProspectName(task) {
    // Extraire nom depuis titre ou contenu
    const text = `${task.title} ${task.content || ''}`;

    // Pattern: "1. Nom - Téléphone"
    const match = text.match(/\d+\.\s+([A-ZÀ-ÿ][a-zà-ÿ]+\s+[A-ZÀ-ÿ][a-zà-ÿ]+)/);

    if (match) return match[1];

    return null;
  }
}

module.exports = SmartOrchestrator;

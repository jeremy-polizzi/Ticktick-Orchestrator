const TickTickAPI = require('../api/ticktick-api');
const GoogleCalendarAPI = require('../api/google-calendar-api');
const AirtableAPI = require('../api/airtable-api');
const { getInstance: getActivityTracker } = require('./activity-tracker');
const logger = require('../utils/logger');
const config = require('../config/config');

/**
 * IntelligentScheduler - Inspiré de Reclaim.ai et Motion
 *
 * PRINCIPES:
 * 1. Système de priorités P1 (Critical) → P4 (Low)
 * 2. "Next Best Time" - trouve le meilleur créneau
 * 3. Delta sync - uniquement les changements
 * 4. Ajustement continu - reschedule automatiquement
 * 5. Respect des préférences utilisateur (matin/après-midi)
 */
class IntelligentScheduler {
  constructor() {
    this.ticktick = new TickTickAPI();
    this.googleCalendar = new GoogleCalendarAPI();
    this.airtable = new AirtableAPI();

    // Système de priorités P1-P4 (comme Reclaim.ai)
    this.priorities = {
      P1_CRITICAL: { value: 1, ticktickPriority: 5, rescheduleOthers: true },
      P2_HIGH: { value: 2, ticktickPriority: 3, rescheduleOthers: true },
      P3_MEDIUM: { value: 3, ticktickPriority: 1, rescheduleOthers: false },
      P4_LOW: { value: 4, ticktickPriority: 0, rescheduleOthers: false }
    };

    // Préférences horaires
    this.workHours = {
      start: 8, // 8h
      end: 18,  // 18h
      lunchStart: 12,
      lunchEnd: 14
    };

    // Cache pour delta sync
    this.lastSync = {
      timestamp: null,
      tasksSnapshot: new Map(),
      calendarSnapshot: new Map()
    };
  }

  async initialize() {
    try {
      await this.airtable.initialize();
      await this.ticktick.loadTokens();
      await this.googleCalendar.loadTokens();

      logger.info('IntelligentScheduler initialisé avec succès');
      return true;
    } catch (error) {
      logger.error('Erreur initialisation IntelligentScheduler:', error.message);
      return false;
    }
  }

  // === DELTA SYNC - Seulement les changements ===

  async getChangedTasks() {
    const allTasks = await this.ticktick.getTasks();
    const changedTasks = [];

    if (!this.lastSync.timestamp) {
      // Premier sync - tout est nouveau
      allTasks.forEach(task => {
        this.lastSync.tasksSnapshot.set(task.id, {
          modifiedTime: task.modifiedTime,
          dueDate: task.dueDate,
          status: task.status
        });
      });
      return allTasks;
    }

    // Delta sync - seulement les modifiés
    for (const task of allTasks) {
      const cached = this.lastSync.tasksSnapshot.get(task.id);

      if (!cached || cached.modifiedTime !== task.modifiedTime) {
        changedTasks.push(task);
        this.lastSync.tasksSnapshot.set(task.id, {
          modifiedTime: task.modifiedTime,
          dueDate: task.dueDate,
          status: task.status
        });
      }
    }

    logger.info(`Delta sync: ${changedTasks.length} tâches modifiées sur ${allTasks.length}`);
    return changedTasks;
  }

  // === NEXT BEST TIME - Trouve le meilleur créneau ===

  async findNextBestTime(task, priority, duration) {
    // Récupérer événements calendrier
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(now.getDate() + 14); // Chercher sur 14 jours

    const calendarId = config.calendars.jeremy;
    const events = await this.googleCalendar.getEvents(calendarId, now, endDate);

    // Générer créneaux candidats
    const candidates = this.generateTimeSlotCandidates(task, priority, duration, events);

    // Scorer chaque créneau
    const scored = candidates.map(slot => ({
      ...slot,
      score: this.scoreTimeSlot(slot, task, priority)
    }));

    // Trier par score (meilleur d'abord)
    scored.sort((a, b) => b.score - a.score);

    return scored[0]; // Meilleur créneau
  }

  generateTimeSlotCandidates(task, priority, duration, existingEvents) {
    const candidates = [];
    const now = new Date();

    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const date = new Date(now);
      date.setDate(now.getDate() + dayOffset);

      // Ignorer weekends pour tâches d'appels
      const dayOfWeek = date.getDay();
      if (task.type === 'session_appels' && (dayOfWeek === 0 || dayOfWeek === 6)) {
        continue;
      }

      // Générer créneaux dans la journée
      const daySlots = this.generateDaySlots(date, duration, existingEvents, priority);
      candidates.push(...daySlots);
    }

    return candidates;
  }

  generateDaySlots(date, duration, existingEvents, priority) {
    const slots = [];
    const startHour = this.workHours.start;
    const endHour = this.workHours.end;

    // Créneaux de 30 minutes
    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const slotStart = new Date(date);
        slotStart.setHours(hour, minute, 0, 0);

        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + duration);

        // Vérifier si créneau libre ou peut reschedule
        if (this.isSlotAvailable(slotStart, slotEnd, existingEvents, priority)) {
          slots.push({
            start: slotStart,
            end: slotEnd,
            date: slotStart.toISOString().split('T')[0],
            hour,
            minute
          });
        }
      }
    }

    return slots;
  }

  isSlotAvailable(start, end, existingEvents, priority) {
    for (const event of existingEvents) {
      const eventStart = new Date(event.start.dateTime || event.start.date);
      const eventEnd = new Date(event.end.dateTime || event.end.date);

      // Chevauchement ?
      if (start < eventEnd && end > eventStart) {
        // P1/P2 peuvent reschedule les événements moins prioritaires
        const eventPriority = this.getEventPriority(event);
        if (priority.value <= 2 && eventPriority > priority.value) {
          return true; // Peut reschedule
        }
        return false; // Conflit
      }
    }

    return true; // Libre
  }

  getEventPriority(event) {
    // Déduire priorité depuis description/titre
    if (!event.summary) return 4; // Default LOW

    const summary = event.summary.toLowerCase();
    if (summary.includes('urgent') || summary.includes('critical')) return 1;
    if (summary.includes('important') || summary.includes('high')) return 2;
    if (summary.includes('medium')) return 3;
    return 4;
  }

  scoreTimeSlot(slot, task, priority) {
    let score = 100;

    // 1. Préférence matin/après-midi
    if (task.when === 'morning' && slot.hour >= 8 && slot.hour < 12) {
      score += 50; // Bonus matin
    } else if (task.when === 'afternoon' && slot.hour >= 14 && slot.hour < 18) {
      score += 50; // Bonus après-midi
    }

    // 2. Éviter pause déjeuner
    if (slot.hour >= this.workHours.lunchStart && slot.hour < this.workHours.lunchEnd) {
      score -= 30;
    }

    // 3. Priorité Critical → plus tôt possible
    if (priority.value === 1) {
      const daysFromNow = Math.floor((slot.start - new Date()) / (1000 * 60 * 60 * 24));
      score += Math.max(0, 30 - daysFromNow * 5); // Bonus si proche
    }

    // 4. Début de journée légèrement favorisé
    if (slot.hour === 8 || slot.hour === 9) {
      score += 10;
    }

    return score;
  }

  // === ANALYSE AIRTABLE ET CRÉATION INTELLIGENTE ===

  async analyzeAndScheduleFromCRM() {
    const tracker = getActivityTracker();

    try {
      tracker.startActivity('intelligent_scheduling', 'Planification intelligente depuis CRM');

      // 1. Analyser Airtable
      tracker.addStep('analyze_crm', '📊 Analyse CRM Airtable');
      const prospects = await this.airtable.getProspects();

      const analysis = this.analyzeProspects(prospects);
      tracker.completeStep({ prospectsAnalyzed: prospects.length });

      // 2. Générer actions avec priorités P1-P4
      tracker.addStep('generate_actions', '🎯 Génération actions prioritaires');
      const actions = this.generatePrioritizedActions(analysis);
      tracker.completeStep({ actionsGenerated: actions.length });

      // 3. Planifier intelligemment chaque action
      tracker.addStep('intelligent_schedule', '🧠 Planification intelligente (Next Best Time)');
      const scheduled = await this.scheduleActionsIntelligently(actions);
      tracker.completeStep({ tasksScheduled: scheduled.length });

      tracker.updateProgress(100);
      tracker.endActivity('success', { tasksCreated: scheduled.length });

      return {
        success: true,
        tasksCreated: scheduled.length,
        actions: scheduled
      };

    } catch (error) {
      tracker.failStep(error);
      tracker.endActivity('failed', { error: error.message });
      throw error;
    }
  }

  analyzeProspects(prospects) {
    const now = Date.now();
    const analysis = {
      criticalUrgent: [], // P1: >15 jours sans contact
      highPriority: [],   // P2: 7-15 jours
      mediumPriority: [], // P3: 3-7 jours
      lowPriority: []     // P4: <3 jours
    };

    for (const prospect of prospects) {
      const lastContact = new Date(prospect.fields['Dernière modification'] || 0);
      const daysSinceContact = Math.floor((now - lastContact) / (1000 * 60 * 60 * 24));

      const prospectData = {
        id: prospect.id,
        nom: `${prospect.fields['Prénom'] || ''} ${prospect.fields['Nom'] || ''}`.trim(),
        telephone: prospect.fields['Téléphone'],
        statut: prospect.fields['Statut'],
        daysSinceContact
      };

      if (daysSinceContact > 15) {
        analysis.criticalUrgent.push(prospectData);
      } else if (daysSinceContact > 7) {
        analysis.highPriority.push(prospectData);
      } else if (daysSinceContact > 3) {
        analysis.mediumPriority.push(prospectData);
      } else {
        analysis.lowPriority.push(prospectData);
      }
    }

    return analysis;
  }

  generatePrioritizedActions(analysis) {
    const actions = [];

    // P1 Critical: Prospects >15 jours
    if (analysis.criticalUrgent.length > 0) {
      actions.push({
        priority: this.priorities.P1_CRITICAL,
        type: 'session_appels',
        titre: `URGENT: Relancer ${analysis.criticalUrgent.length} prospects (>15j)`,
        description: `Relance critique de ${analysis.criticalUrgent.length} prospects sans contact depuis plus de 15 jours`,
        duration: Math.min(120, analysis.criticalUrgent.length * 5),
        when: 'morning',
        prospects: analysis.criticalUrgent,
        revenuPotentiel: analysis.criticalUrgent.length * 640
      });
    }

    // P2 High: Prospects 7-15 jours
    if (analysis.highPriority.length > 0) {
      actions.push({
        priority: this.priorities.P2_HIGH,
        type: 'session_appels',
        titre: `Relancer ${analysis.highPriority.length} prospects (7-15j)`,
        description: `Relance de ${analysis.highPriority.length} prospects sans contact depuis 7-15 jours`,
        duration: Math.min(90, analysis.highPriority.length * 4),
        when: 'morning',
        prospects: analysis.highPriority,
        revenuPotentiel: analysis.highPriority.length * 640
      });
    }

    return actions;
  }

  async scheduleActionsIntelligently(actions) {
    const scheduled = [];

    for (const action of actions) {
      // Trouver next best time
      const bestSlot = await this.findNextBestTime(action, action.priority, action.duration);

      if (!bestSlot) {
        logger.warn(`Aucun créneau trouvé pour: ${action.titre}`);
        continue;
      }

      // Créer tâche TickTick avec date optimale
      const task = await this.ticktick.createTask({
        title: action.titre,
        content: action.description,
        priority: action.priority.ticktickPriority,
        dueDate: bestSlot.date,
        tags: ['cap-numerique', 'auto-scheduled']
      });

      logger.info(`✅ Planifié: "${action.titre}" pour ${bestSlot.date} ${bestSlot.hour}h${bestSlot.minute.toString().padStart(2, '0')} (score: ${bestSlot.score})`);

      scheduled.push({
        action,
        task,
        slot: bestSlot
      });
    }

    return scheduled;
  }

  // === AJUSTEMENT CONTINU ===

  async performContinuousAdjustment() {
    const { getInstance: getActivityTracker } = require('./activity-tracker');
    const tracker = getActivityTracker();

    try {
      tracker.startActivity('continuous_adjustment', '🔄 Ajustement Continu - Reschedule Automatique');

      // Step 1: Delta Sync - récupérer tâches modifiées
      tracker.addStep('delta_sync', '🔍 Delta Sync - Analyse tâches modifiées');
      logger.info('🔄 Ajustement continu - reschedule automatique');

      const changedTasks = await this.getChangedTasks();
      tracker.completeStep({
        totalTasks: changedTasks.length,
        sync: changedTasks.length === 162 ? 'baseline' : 'delta'
      });
      tracker.updateProgress(30);

      logger.info(`📊 Delta Sync: ${changedTasks.length} tâches analysées`);

      // Step 2: Tâches sans date - leur donner une date
      tracker.addStep('assign_dates', '📅 Attribution dates aux tâches sans date');

      const tasksWithoutDate = changedTasks.filter(t => !t.dueDate && !t.isCompleted && t.status !== 2);
      let datesAssigned = 0;

      logger.info(`📅 ${tasksWithoutDate.length} tâches sans date trouvées`);

      // Récupérer TOUTES les tâches pour calculer la charge correctement
      const allTasks = await this.ticktick.getTasks();

      // Calculer charge par jour UNE SEULE FOIS (optimisation performance)
      const loadByDay = await this.calculateLoadByDay(allTasks);

      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 5; // Arrêter après 5 erreurs consécutives
      const batchSize = 10; // Traiter par lots de 10
      const batchPauseMs = 15000; // Pause 15 secondes entre chaque lot

      for (let i = 0; i < tasksWithoutDate.length; i++) {
        const task = tasksWithoutDate[i];

        // Arrêter si trop d'erreurs consécutives (rate limit sévère)
        if (consecutiveErrors >= maxConsecutiveErrors) {
          logger.warn(`⚠️ Arrêt assignation après ${consecutiveErrors} erreurs consécutives (rate limit)`);
          tracker.logError('rate_limit_stop', 'Trop d\'erreurs consécutives', {
            consecutiveErrors,
            datesAssigned,
            remaining: tasksWithoutDate.length - datesAssigned
          });
          break;
        }

        const priority = this.deducePriorityFromTask(task);
        const bestDate = this.selectLeastLoadedDay(priority, loadByDay);

        if (bestDate) {
          // Afficher tâche en cours sur dashboard
          tracker.updateActivityDetails({
            currentTaskIndex: i + 1,
            totalTasks: tasksWithoutDate.length,
            currentTask: task.title,
            targetDate: bestDate,
            status: 'processing',
            successCount: datesAssigned,
            errorCount: consecutiveErrors
          });

          // Mise à jour avec retry si erreur
          try {
            await this.ticktick.updateTask(task.id, { dueDate: bestDate });
            datesAssigned++;
            consecutiveErrors = 0; // Reset compteur si succès

            // Incrémenter charge ce jour (pour prochain assignement)
            loadByDay[bestDate] = (loadByDay[bestDate] || 0) + 1;

            // Mettre à jour dashboard avec succès
            tracker.updateActivityDetails({
              currentTaskIndex: i + 1,
              totalTasks: tasksWithoutDate.length,
              currentTask: task.title,
              targetDate: bestDate,
              status: 'success',
              successCount: datesAssigned,
              errorCount: consecutiveErrors
            });

            if (datesAssigned <= 5 || datesAssigned % 10 === 0) {
              logger.info(`📅 Date attribuée (${datesAssigned}/${tasksWithoutDate.length}): "${task.title.substring(0, 50)}..." → ${bestDate}`);
            }

            // Délai 500ms entre chaque update pour éviter rate limiting TickTick
            await new Promise(resolve => setTimeout(resolve, 500));

            // Pause longue tous les 10 updates (batch pause)
            if (datesAssigned % batchSize === 0 && i < tasksWithoutDate.length - 1) {
              logger.info(`⏸️ Pause ${batchPauseMs/1000}s après ${datesAssigned} tâches (évite rate limit)`);

              // Afficher pause sur dashboard
              tracker.updateActivityDetails({
                status: 'paused',
                pauseReason: `Pause ${batchPauseMs/1000}s après ${datesAssigned} tâches (évite rate limit)`,
                successCount: datesAssigned,
                errorCount: consecutiveErrors
              });

              await new Promise(resolve => setTimeout(resolve, batchPauseMs));
            }

          } catch (error) {
            consecutiveErrors++;

            // Mettre à jour dashboard avec erreur
            tracker.updateActivityDetails({
              currentTaskIndex: i + 1,
              totalTasks: tasksWithoutDate.length,
              currentTask: task.title,
              targetDate: bestDate,
              status: 'error',
              lastError: error.message,
              successCount: datesAssigned,
              errorCount: consecutiveErrors
            });

            // Logger seulement les 3 premières erreurs et ensuite tous les 10
            if (consecutiveErrors <= 3 || consecutiveErrors % 10 === 0) {
              logger.error(`Erreur attribution date tâche ${task.id}:`, error.message);
              if (error.response) {
                logger.error(`  → Status: ${error.response.status}, Data:`, JSON.stringify(error.response.data));
              }
            }

            // Enregistrer l'erreur dans le tracker pour l'afficher sur le dashboard
            tracker.logError('assign_date', error, {
              taskId: task.id,
              taskTitle: task.title?.substring(0, 50),
              bestDate,
              consecutiveErrors
            });

            // Continue avec les autres tâches au lieu de crasher
          }
        }
      }

      logger.info(`✅ Attribution dates terminée: ${datesAssigned}/${tasksWithoutDate.length} tâches`);

      tracker.completeStep({ tasksWithoutDate: tasksWithoutDate.length, datesAssigned });
      tracker.updateProgress(40);

      // Step 3: Détection jours surchargés dans TickTick
      tracker.addStep('conflict_detection', '⚠️ Détection jours surchargés TickTick (>3 tâches)');

      // Utiliser loadByDay déjà mis à jour localement (évite getTasks() pour rate limiting)
      // loadByDay a été incrémenté après chaque assignation réussie
      logger.info('📊 Utilisation cache loadByDay (évite rate limiting TickTick)');

      let rescheduled = 0;
      let conflictsDetected = 0;
      const tasksToReschedule = [];

      for (const task of changedTasks) {
        if (this.needsReschedule(task, loadByDay)) {
          conflictsDetected++;
          tasksToReschedule.push(task);
        }
      }

      tracker.completeStep({ conflictsDetected });
      tracker.updateProgress(60);

      logger.info(`⚠️ ${conflictsDetected} jours surchargés détectés dans TickTick`);

      // Step 4: Replanification intelligente (répartir les tâches)
      if (tasksToReschedule.length > 0) {
        tracker.addStep('reschedule', `📅 Répartition de ${tasksToReschedule.length} tâches vers jours peu chargés`);

        for (let i = 0; i < tasksToReschedule.length; i++) {
          const task = tasksToReschedule[i];

          const oldDate = task.dueDate;
          await this.rescheduleTask(task);
          rescheduled++;

          logger.info(`🔄 [${i + 1}/${tasksToReschedule.length}] Replanifié: "${task.title}" de ${oldDate} → nouvelle date`);

          // Délai 300ms entre chaque reschedule pour éviter rate limiting TickTick
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        tracker.completeStep({ rescheduled });
        tracker.updateProgress(100);
      } else {
        tracker.addStep('no_conflicts', '✅ Aucun conflit détecté - Pas de replanification nécessaire');
        tracker.completeStep({ message: 'Tous les créneaux sont optimaux' });
        tracker.updateProgress(100);
      }

      this.lastSync.timestamp = Date.now();

      logger.info(`✅ Ajustement continu: ${rescheduled} tâches replanifiées`);

      tracker.endActivity('success', {
        tasksAnalyzed: changedTasks.length,
        datesAssigned,
        conflictsDetected,
        tasksRescheduled: rescheduled
      });

      return {
        success: true,
        tasksAnalyzed: changedTasks.length,
        tasksWithoutDate: tasksWithoutDate.length,
        datesAssigned,
        conflictsDetected,
        tasksRescheduled: rescheduled,
        syncType: changedTasks.length === 162 ? 'baseline' : 'delta'
      };

    } catch (error) {
      logger.error('❌ Erreur ajustement continu:', error.message);
      tracker.failStep(error);
      tracker.endActivity('failed', { error: error.message });
      throw error;
    }
  }

  needsReschedule(task, loadByDay) {
    // ❌ NE JAMAIS analyser Calendar - TickTick est la source de vérité
    // Vérifier si le JOUR a trop de tâches dans TickTick
    if (!task.dueDate) return false;

    const taskDate = task.dueDate.split('T')[0];

    // Utiliser loadByDay pré-calculé au lieu d'appeler getTasks()
    const taskCount = loadByDay[taskDate] || 0;

    // Jour surchargé si >3 tâches TickTick ce jour
    return taskCount > 3;
  }

  async rescheduleTask(task) {
    const priority = this.deducePriorityFromTask(task);
    const oldDate = task.dueDate ? task.dueDate.split('T')[0] : 'sans date';

    // Trouver un jour peu chargé dans TickTick (≤3 tâches)
    const bestDate = await this.findLeastLoadedDay(priority);

    if (bestDate) {
      await this.ticktick.updateTask(task.id, {
        dueDate: bestDate
      });

      logger.info(`🔄 Replanifié: "${task.title}" de ${oldDate} → ${bestDate}`);
    }
  }

  async calculateLoadByDay(allTasks) {
    // Calculer charge par jour UNE SEULE FOIS pour performance
    const today = new Date();
    const loadByDay = {};

    // Initialiser tous les jours à 0
    for (let i = 0; i < 60; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      loadByDay[dateStr] = 0;
    }

    // Compter tâches par jour
    for (const task of allTasks) {
      if (!task.dueDate || task.isCompleted || task.status === 2) continue;

      const taskDate = task.dueDate.split('T')[0];
      if (loadByDay.hasOwnProperty(taskDate)) {
        loadByDay[taskDate]++;
      }
    }

    return loadByDay;
  }

  selectLeastLoadedDay(priority, loadByDay) {
    // Sélectionner jour avec le moins de charge (sans refaire getTasks)
    const today = new Date();

    // Trouver jours avec ≤2 tâches (pour ne pas dépasser 3 après ajout)
    const availableDays = Object.entries(loadByDay)
      .filter(([date, count]) => count <= 2)
      .sort((a, b) => a[1] - b[1]); // Trier par charge croissante

    if (availableDays.length === 0) {
      // Tous les jours pleins, prendre le moins chargé quand même
      const leastLoaded = Object.entries(loadByDay)
        .sort((a, b) => a[1] - b[1]);
      return leastLoaded.length > 0 ? leastLoaded[0][0] : null;
    }

    // P1 CRITICAL: premier jour disponible
    if (priority.value === 1) {
      return availableDays[0][0];
    }

    // P2 HIGH: dans les 7 premiers jours
    if (priority.value === 2) {
      const firstWeek = availableDays.filter(([date]) => {
        const d = new Date(date);
        const diff = Math.floor((d - today) / (1000 * 60 * 60 * 24));
        return diff <= 7;
      });
      return firstWeek.length > 0 ? firstWeek[0][0] : availableDays[0][0];
    }

    // P3/P4: répartir plus loin
    const midIndex = Math.floor(availableDays.length / 2);
    return availableDays[midIndex][0];
  }

  deducePriorityFromTask(task) {
    const priority = task.priority || 0;
    if (priority >= 5) return this.priorities.P1_CRITICAL;
    if (priority >= 3) return this.priorities.P2_HIGH;
    if (priority >= 1) return this.priorities.P3_MEDIUM;
    return this.priorities.P4_LOW;
  }
}

module.exports = IntelligentScheduler;

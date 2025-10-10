const logger = require('../utils/logger');

/**
 * Activity Tracker - Tracking en temps réel des opérations orchestrateur
 *
 * Permet de savoir exactement ce qui se passe à l'instant T
 */
class ActivityTracker {
  constructor() {
    this.currentActivity = null;
    this.activityHistory = [];
    this.maxHistorySize = 50;
    this.startTime = null;
  }

  /**
   * Démarre une nouvelle activité
   * @param {string} type - Type d'activité (sync, analysis, backup, etc.)
   * @param {string} description - Description de l'activité
   * @param {object} metadata - Métadonnées supplémentaires
   */
  startActivity(type, description, metadata = {}) {
    const activity = {
      id: `activity_${Date.now()}`,
      type,
      description,
      metadata,
      status: 'in_progress',
      startTime: new Date().toISOString(),
      startTimestamp: Date.now(),
      progress: 0,
      steps: [],
      currentStep: null,
      errors: [] // Tableau des erreurs rencontrées
    };

    this.currentActivity = activity;
    this.startTime = Date.now();

    logger.info(`🚀 Activité démarrée: ${type} - ${description}`);

    return activity.id;
  }

  /**
   * Ajoute une étape à l'activité courante
   * @param {string} stepName - Nom de l'étape
   * @param {string} stepDescription - Description de l'étape
   */
  addStep(stepName, stepDescription = '') {
    if (!this.currentActivity) {
      logger.warn('Tentative d\'ajout d\'étape sans activité courante');
      return;
    }

    const step = {
      name: stepName,
      description: stepDescription,
      status: 'in_progress',
      startTime: new Date().toISOString(),
      startTimestamp: Date.now()
    };

    this.currentActivity.steps.push(step);
    this.currentActivity.currentStep = stepName;

    logger.debug(`  📍 Étape: ${stepName} - ${stepDescription}`);
  }

  /**
   * Marque l'étape courante comme terminée
   * @param {object} result - Résultat de l'étape
   */
  completeStep(result = {}) {
    if (!this.currentActivity || this.currentActivity.steps.length === 0) {
      return;
    }

    const currentStep = this.currentActivity.steps[this.currentActivity.steps.length - 1];
    currentStep.status = 'completed';
    currentStep.endTime = new Date().toISOString();
    currentStep.duration = Date.now() - currentStep.startTimestamp;
    currentStep.result = result;

    logger.debug(`  ✅ Étape terminée: ${currentStep.name} (${currentStep.duration}ms)`);
  }

  /**
   * Marque l'étape courante comme échouée
   * @param {Error} error - Erreur survenue
   */
  failStep(error) {
    if (!this.currentActivity || this.currentActivity.steps.length === 0) {
      return;
    }

    const currentStep = this.currentActivity.steps[this.currentActivity.steps.length - 1];
    currentStep.status = 'failed';
    currentStep.endTime = new Date().toISOString();
    currentStep.duration = Date.now() - currentStep.startTimestamp;
    currentStep.error = error.message;

    logger.error(`  ❌ Étape échouée: ${currentStep.name} - ${error.message}`);
  }

  /**
   * Met à jour la progression de l'activité
   * @param {number} progress - Progression (0-100)
   */
  updateProgress(progress) {
    if (!this.currentActivity) {
      return;
    }

    this.currentActivity.progress = Math.min(100, Math.max(0, progress));
  }

  /**
   * Enregistre une erreur dans l'activité courante
   * @param {string} context - Contexte de l'erreur (ex: "update_task", "get_calendar")
   * @param {Error|string} error - Erreur ou message d'erreur
   * @param {object} details - Détails supplémentaires (taskId, status code, etc.)
   */
  logError(context, error, details = {}) {
    if (!this.currentActivity) {
      return;
    }

    const errorEntry = {
      timestamp: new Date().toISOString(),
      context,
      message: typeof error === 'string' ? error : error.message,
      details
    };

    // Ajouter response data si disponible (erreurs HTTP)
    if (error.response) {
      errorEntry.httpStatus = error.response.status;
      errorEntry.httpData = error.response.data;
    }

    this.currentActivity.errors.push(errorEntry);

    logger.debug(`  ⚠️ Erreur enregistrée: ${context} - ${errorEntry.message}`);
  }

  /**
   * Termine l'activité courante
   * @param {string} status - Status final (success/failed)
   * @param {object} result - Résultat final
   */
  endActivity(status = 'success', result = {}) {
    if (!this.currentActivity) {
      logger.warn('Tentative de fin d\'activité sans activité courante');
      return;
    }

    this.currentActivity.status = status;
    this.currentActivity.endTime = new Date().toISOString();
    this.currentActivity.duration = Date.now() - this.currentActivity.startTimestamp;
    this.currentActivity.result = result;
    this.currentActivity.progress = status === 'success' ? 100 : this.currentActivity.progress;

    logger.info(`✅ Activité terminée: ${this.currentActivity.type} - ${status} (${this.currentActivity.duration}ms)`);

    // Ajouter à l'historique
    this.activityHistory.unshift(this.currentActivity);

    // Limiter la taille de l'historique
    if (this.activityHistory.length > this.maxHistorySize) {
      this.activityHistory.splice(this.maxHistorySize);
    }

    this.currentActivity = null;
    this.startTime = null;
  }

  /**
   * Récupère l'état courant complet
   * @returns {object} État courant
   */
  getCurrentState() {
    const now = Date.now();

    return {
      hasActiveActivity: !!this.currentActivity,
      currentActivity: this.currentActivity ? {
        ...this.currentActivity,
        elapsedTime: now - this.currentActivity.startTimestamp,
        estimatedTimeRemaining: this.estimateTimeRemaining()
      } : null,
      recentHistory: this.activityHistory.slice(0, 10),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Estime le temps restant basé sur la progression
   * @returns {number} Temps restant estimé en ms
   */
  estimateTimeRemaining() {
    if (!this.currentActivity || this.currentActivity.progress === 0) {
      return null;
    }

    const elapsed = Date.now() - this.currentActivity.startTimestamp;
    const estimatedTotal = (elapsed / this.currentActivity.progress) * 100;
    return Math.max(0, estimatedTotal - elapsed);
  }

  /**
   * Récupère l'historique récent
   * @param {number} limit - Nombre d'entrées à retourner
   * @returns {array} Historique
   */
  getHistory(limit = 10) {
    return this.activityHistory.slice(0, limit);
  }

  /**
   * Vérifie si une activité est en cours
   * @returns {boolean}
   */
  isActive() {
    return !!this.currentActivity;
  }

  /**
   * Récupère les statistiques d'activité
   * @returns {object} Statistiques
   */
  getStats() {
    const completedActivities = this.activityHistory.filter(a => a.status === 'success');
    const failedActivities = this.activityHistory.filter(a => a.status === 'failed');

    const avgDuration = completedActivities.length > 0
      ? completedActivities.reduce((sum, a) => sum + a.duration, 0) / completedActivities.length
      : 0;

    return {
      total: this.activityHistory.length,
      completed: completedActivities.length,
      failed: failedActivities.length,
      avgDuration: Math.round(avgDuration),
      currentlyActive: this.isActive()
    };
  }

  /**
   * Nettoie l'historique
   */
  clearHistory() {
    this.activityHistory = [];
    logger.info('Historique d\'activité nettoyé');
  }
}

// Singleton
let instance = null;

module.exports = {
  getInstance: () => {
    if (!instance) {
      instance = new ActivityTracker();
    }
    return instance;
  },
  ActivityTracker
};

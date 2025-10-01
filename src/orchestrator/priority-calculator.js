const logger = require('../utils/logger');
const config = require('../config/config');

class PriorityCalculator {
  constructor() {
    this.weights = config.priorities;

    // Mots-clés pour l'analyse de complexité
    this.complexityKeywords = {
      high: ['développement', 'programmation', 'code', 'architecture', 'design', 'recherche', 'analyse', 'stratégie'],
      medium: ['rédaction', 'planning', 'organisation', 'formation', 'apprentissage', 'révision'],
      low: ['appel', 'email', 'lecture', 'vérification', 'mise à jour', 'simple']
    };

    // Mots-clés d'urgence
    this.urgencyKeywords = {
      urgent: ['urgent', 'asap', 'priorité', 'important', 'critique', 'deadline'],
      medium: ['bientôt', 'prochainement', 'planifié'],
      low: ['optionnel', 'si possible', 'when possible']
    };

    // Tags spéciaux avec poids
    this.specialTags = {
      '#urgent': 0.9,
      '#important': 0.8,
      '#business': 0.7,
      '#client': 0.8,
      '#formation': 0.6,
      '#personnel': 0.3,
      '#optionnel': 0.2
    };
  }

  async calculatePriorities(tasks) {
    try {
      logger.info(`Calcul des priorités pour ${tasks.length} tâches`);

      const scoredTasks = tasks.map(task => ({
        ...task,
        priority_score: this.calculateTaskScore(task),
        priority_details: this.getScoreDetails(task)
      }));

      // Trier par score décroissant
      scoredTasks.sort((a, b) => b.priority_score - a.priority_score);

      logger.info('Calcul des priorités terminé');
      return scoredTasks;
    } catch (error) {
      logger.error('Erreur lors du calcul des priorités:', error.message);
      throw error;
    }
  }

  calculateTaskScore(task) {
    const complexity = this.calculateComplexity(task);
    const urgency = this.calculateUrgency(task);
    const duration = this.calculateDurationScore(task);
    const context = this.calculateContextScore(task);

    const score = (
      complexity * this.weights.complexityWeight +
      urgency * this.weights.urgencyWeight +
      duration * this.weights.durationWeight +
      context * this.weights.contextWeight
    );

    return Math.round(score * 100) / 100; // Arrondi à 2 décimales
  }

  calculateComplexity(task) {
    const text = `${task.title} ${task.content || ''}`.toLowerCase();

    // Longueur du texte (indicateur de complexité)
    let score = Math.min(text.length / 200, 1); // Normaliser sur 200 caractères

    // Recherche de mots-clés de complexité
    for (const [level, keywords] of Object.entries(this.complexityKeywords)) {
      const found = keywords.some(keyword => text.includes(keyword));
      if (found) {
        switch (level) {
          case 'high':
            score = Math.max(score, 0.9);
            break;
          case 'medium':
            score = Math.max(score, 0.6);
            break;
          case 'low':
            score = Math.min(score, 0.3);
            break;
        }
      }
    }

    // Détection de sous-tâches (indicateur de complexité)
    const subtaskIndicators = ['-', '•', '1.', '2.', 'a)', 'b)'];
    const hasSubtasks = subtaskIndicators.some(indicator => text.includes(indicator));
    if (hasSubtasks) {
      score += 0.2;
    }

    return Math.min(score, 1);
  }

  calculateUrgency(task) {
    let score = 0.5; // Score de base

    const text = `${task.title} ${task.content || ''}`.toLowerCase();

    // Analyse des mots-clés d'urgence
    for (const [level, keywords] of Object.entries(this.urgencyKeywords)) {
      const found = keywords.some(keyword => text.includes(keyword));
      if (found) {
        switch (level) {
          case 'urgent':
            score = 0.9;
            break;
          case 'medium':
            score = 0.6;
            break;
          case 'low':
            score = 0.3;
            break;
        }
      }
    }

    // Analyse de la date d'échéance
    if (task.dueDate) {
      const dueDate = new Date(task.dueDate);
      const now = new Date();
      const timeDiff = dueDate - now;
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

      if (daysDiff < 0) {
        // Tâche en retard
        score = 1.0;
      } else if (daysDiff < 1) {
        // Tâche pour aujourd'hui
        score = Math.max(score, 0.9);
      } else if (daysDiff < 3) {
        // Tâche pour les prochains jours
        score = Math.max(score, 0.7);
      } else if (daysDiff < 7) {
        // Tâche pour la semaine
        score = Math.max(score, 0.5);
      }
    }

    // Priorité native TickTick
    if (task.priority && task.priority > 0) {
      score += task.priority * 0.1; // TickTick priority: 1-5
    }

    return Math.min(score, 1);
  }

  calculateDurationScore(task) {
    let score = 0.5; // Score de base

    // Estimation de durée basée sur le contenu
    const text = `${task.title} ${task.content || ''}`;
    const wordCount = text.split(' ').length;

    // Plus de texte = probablement plus long
    if (wordCount > 50) {
      score = 0.8; // Tâche longue
    } else if (wordCount > 20) {
      score = 0.6; // Tâche moyenne
    } else {
      score = 0.4; // Tâche courte
    }

    // Mots-clés indicateurs de durée
    const longTaskKeywords = ['développement', 'création', 'rédaction', 'formation', 'recherche'];
    const shortTaskKeywords = ['appel', 'email', 'check', 'vérification', 'lecture'];

    const textLower = text.toLowerCase();

    if (longTaskKeywords.some(keyword => textLower.includes(keyword))) {
      score = Math.max(score, 0.8);
    }

    if (shortTaskKeywords.some(keyword => textLower.includes(keyword))) {
      score = Math.min(score, 0.3);
    }

    // Durée estimée si spécifiée dans TickTick
    if (task.timeEstimate) {
      const minutes = task.timeEstimate;
      if (minutes > 120) {
        score = 0.9; // Plus de 2h
      } else if (minutes > 60) {
        score = 0.7; // 1-2h
      } else if (minutes > 30) {
        score = 0.5; // 30min-1h
      } else {
        score = 0.3; // Moins de 30min
      }
    }

    return score;
  }

  calculateContextScore(task) {
    let score = 0.5; // Score de base

    // Analyse des tags spéciaux
    if (task.tags && task.tags.length > 0) {
      for (const tag of task.tags) {
        const tagKey = `#${tag.toLowerCase()}`;
        if (this.specialTags[tagKey]) {
          score = Math.max(score, this.specialTags[tagKey]);
        }
      }
    }

    // Analyse du projet/liste
    if (task.projectId) {
      // Les projets professionnels ont plus de poids
      // (Cette logique pourrait être enrichie avec une mapping des projets)
      score += 0.1;
    }

    // Contexte temporel
    const now = new Date();
    const currentHour = now.getHours();

    // Heures de travail favorisent les tâches business
    if (currentHour >= 9 && currentHour <= 18) {
      const text = `${task.title} ${task.content || ''}`.toLowerCase();
      const businessKeywords = ['client', 'business', 'travail', 'projet', 'développement'];

      if (businessKeywords.some(keyword => text.includes(keyword))) {
        score += 0.2;
      }
    }

    // Jour de la semaine
    const dayOfWeek = now.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Lundi à vendredi
      const text = `${task.title} ${task.content || ''}`.toLowerCase();
      if (text.includes('professionnel') || text.includes('business')) {
        score += 0.1;
      }
    } else {
      // Weekend favorise les tâches personnelles
      const text = `${task.title} ${task.content || ''}`.toLowerCase();
      if (text.includes('personnel') || text.includes('privé')) {
        score += 0.1;
      }
    }

    return Math.min(score, 1);
  }

  getScoreDetails(task) {
    return {
      complexity: this.calculateComplexity(task),
      urgency: this.calculateUrgency(task),
      duration: this.calculateDurationScore(task),
      context: this.calculateContextScore(task),
      weights: this.weights
    };
  }

  // Calcul de la distribution optimale des tâches sur plusieurs jours
  distributeTasksOverDays(tasks, days = 7) {
    try {
      const maxTasksPerDay = config.scheduler.maxDailyTasks;
      const distribution = Array(days).fill().map(() => []);

      // Trier les tâches par priorité
      const sortedTasks = [...tasks].sort((a, b) => b.priority_score - a.priority_score);

      let currentDay = 0;

      for (const task of sortedTasks) {
        // Trouver le jour avec le moins de charge
        let bestDay = currentDay;
        let minLoad = distribution[currentDay].length;

        for (let i = 0; i < days; i++) {
          if (distribution[i].length < minLoad) {
            bestDay = i;
            minLoad = distribution[i].length;
          }
        }

        // Ajouter la tâche au meilleur jour si pas saturé
        if (distribution[bestDay].length < maxTasksPerDay) {
          distribution[bestDay].push(task);
        }

        // Passer au jour suivant pour répartir équitablement
        currentDay = (currentDay + 1) % days;
      }

      logger.info(`Distribution calculée sur ${days} jours`);
      return distribution;
    } catch (error) {
      logger.error('Erreur lors de la distribution des tâches:', error.message);
      throw error;
    }
  }

  // Ajustement des scores selon les patterns historiques
  adjustScoresBasedOnHistory(tasks, completionHistory = []) {
    try {
      // Cette méthode pourrait être enrichie avec ML/AI plus tard
      // Pour l'instant, ajustements simples basés sur l'historique

      for (const task of tasks) {
        // Vérifier si des tâches similaires ont été complétées rapidement
        const similarCompleted = completionHistory.filter(completed => {
          const similarity = this.calculateSimilarity(task.title, completed.title);
          return similarity > 0.7;
        });

        if (similarCompleted.length > 0) {
          const avgCompletionTime = similarCompleted.reduce((sum, t) => sum + t.completionTime, 0) / similarCompleted.length;

          // Ajuster le score de durée basé sur l'historique
          if (avgCompletionTime < 30) { // Moins de 30 minutes
            task.priority_details.duration *= 0.8;
          } else if (avgCompletionTime > 120) { // Plus de 2 heures
            task.priority_details.duration *= 1.2;
          }

          // Recalculer le score total
          task.priority_score = this.calculateTaskScore(task);
        }
      }

      return tasks;
    } catch (error) {
      logger.error('Erreur lors de l\'ajustement des scores:', error.message);
      return tasks;
    }
  }

  calculateSimilarity(text1, text2) {
    // Calcul simple de similarité basé sur les mots communs
    const words1 = text1.toLowerCase().split(' ');
    const words2 = text2.toLowerCase().split(' ');

    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = new Set([...words1, ...words2]).size;

    return commonWords.length / totalWords;
  }

  // Méthode pour ajuster les poids dynamiquement
  updateWeights(newWeights) {
    this.weights = { ...this.weights, ...newWeights };
    logger.info('Poids de priorité mis à jour:', newWeights);
  }

  // Analyse des patterns de productivité
  analyzeProductivityPatterns(tasks, completionHistory) {
    try {
      const patterns = {
        bestTimeOfDay: this.findBestCompletionTime(completionHistory),
        mostProductiveTags: this.findMostProductiveTags(completionHistory),
        averageTaskDuration: this.calculateAverageTaskDuration(completionHistory),
        successfulTaskTypes: this.findSuccessfulTaskTypes(completionHistory)
      };

      logger.info('Patterns de productivité analysés:', patterns);
      return patterns;
    } catch (error) {
      logger.error('Erreur lors de l\'analyse des patterns:', error.message);
      return null;
    }
  }

  findBestCompletionTime(history) {
    const timeSlots = {};

    history.forEach(task => {
      if (task.completedAt) {
        const hour = new Date(task.completedAt).getHours();
        timeSlots[hour] = (timeSlots[hour] || 0) + 1;
      }
    });

    const bestHour = Object.keys(timeSlots).reduce((a, b) =>
      timeSlots[a] > timeSlots[b] ? a : b
    );

    return parseInt(bestHour);
  }

  findMostProductiveTags(history) {
    const tagPerformance = {};

    history.forEach(task => {
      if (task.tags) {
        task.tags.forEach(tag => {
          if (!tagPerformance[tag]) {
            tagPerformance[tag] = { total: 0, completed: 0 };
          }
          tagPerformance[tag].total++;
          if (task.completed) {
            tagPerformance[tag].completed++;
          }
        });
      }
    });

    return Object.entries(tagPerformance)
      .map(([tag, stats]) => ({
        tag,
        completionRate: stats.completed / stats.total,
        total: stats.total
      }))
      .sort((a, b) => b.completionRate - a.completionRate)
      .slice(0, 5);
  }

  calculateAverageTaskDuration(history) {
    const completedTasks = history.filter(task => task.completionTime);
    if (completedTasks.length === 0) return 60; // Default 1 hour

    const totalTime = completedTasks.reduce((sum, task) => sum + task.completionTime, 0);
    return Math.round(totalTime / completedTasks.length);
  }

  findSuccessfulTaskTypes(history) {
    const types = {};

    history.forEach(task => {
      const type = this.categorizeTask(task.title);
      if (!types[type]) {
        types[type] = { total: 0, completed: 0 };
      }
      types[type].total++;
      if (task.completed) {
        types[type].completed++;
      }
    });

    return Object.entries(types)
      .map(([type, stats]) => ({
        type,
        completionRate: stats.completed / stats.total,
        total: stats.total
      }))
      .sort((a, b) => b.completionRate - a.completionRate);
  }

  categorizeTask(title) {
    const titleLower = title.toLowerCase();

    if (this.complexityKeywords.high.some(kw => titleLower.includes(kw))) {
      return 'complex';
    } else if (this.complexityKeywords.medium.some(kw => titleLower.includes(kw))) {
      return 'medium';
    } else {
      return 'simple';
    }
  }
}

module.exports = PriorityCalculator;
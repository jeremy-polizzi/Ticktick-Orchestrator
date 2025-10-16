const logger = require('../utils/logger');
const Anthropic = require('@anthropic-ai/sdk');

/**
 * TaskProjectClassifier - Analyse intelligente pour classifier les tâches dans les bons projets TickTick
 *
 * Supporte 2 modes:
 * 1. LLM Mode (Claude Sonnet) - Analyse contextuelle précise avec IA
 * 2. Smart Rules Mode (fallback) - Matching sémantique avancé basé sur mots-clés
 */
class TaskProjectClassifier {
  constructor() {
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    this.anthropic = null;

    if (this.anthropicApiKey) {
      this.anthropic = new Anthropic({ apiKey: this.anthropicApiKey });
      logger.info('🧠 TaskProjectClassifier initialisé en mode LLM (Claude Sonnet)');
    } else {
      logger.info('🧠 TaskProjectClassifier initialisé en mode Smart Rules (pas de clé API)');
    }

    // Cache des projets TickTick
    this.projects = [];

    // Règles sémantiques intelligentes pour le fallback
    this.semanticRules = {
      'Professionnel': {
        keywords: ['travail', 'boulot', 'job', 'meeting', 'réunion', 'client pro', 'entreprise générale', 'administration'],
        weight: 1.0
      },
      '🚀 Création d\'entreprise': {
        keywords: ['indy', 'sasu', 'siret', 'kbis', 'urssaf', 'création société', 'statuts', 'business plan', 'immatriculation', 'capital social', 'domiciliation'],
        weight: 2.0
      },
      '📈 Plus-de-clients.fr': {
        keywords: ['plus-de-clients', 'pdc.fr', 'site web pdc', 'landing page', 'génération prospects', 'lead gen pdc', 'optimisation conversion', 'tunnel de vente'],
        weight: 2.0
      },
      '⚙ Lead Gen': {
        keywords: ['lead generation', 'prospection', 'linkedin', 'cold email', 'outreach', 'scraping', 'automation prospection', 'lead magnet', 'formulaire capture'],
        weight: 1.8
      },
      '🤝 Closing': {
        keywords: ['closing', 'vente', 'appel vente', 'négociation', 'proposition commerciale', 'devis', 'signature contrat', 'closing call'],
        weight: 1.8
      },
      '🎓 Création de formations': {
        keywords: ['formation', 'cours', 'module', 'vidéo formation', 'système.io', 'systeme.io', 'tunnel formation', 'learnybox', 'teachable', 'podia'],
        weight: 2.0
      },
      '🎥 Chaîne Youtube': {
        keywords: ['youtube', 'vidéo youtube', 'montage vidéo', 'thumbnail', 'miniature', 'script youtube', 'upload youtube', 'chaîne'],
        weight: 2.0
      },
      '🤖 Agent IA': {
        keywords: ['agent ia', 'chatbot', 'automation ia', 'prompt', 'openai', 'claude', 'gpt', 'llm', 'machine learning', 'api ia'],
        weight: 2.0
      },
      'Dev Perso': {
        keywords: ['développement personnel', 'méditation', 'lecture livre', 'habitude', 'routine matinale', 'objectif personnel', 'amélioration'],
        weight: 1.5
      },
      'Santé': {
        keywords: ['sport', 'musculation', 'gym', 'fitness', 'yoga', 'running', 'nutrition', 'santé', 'médecin', 'rendez-vous médical', 'kiné'],
        weight: 1.8
      },
      'Finances': {
        keywords: ['finance', 'banque', 'compte', 'impôts', 'comptabilité', 'facture', 'paiement', 'budget', 'investissement', 'épargne'],
        weight: 1.5
      },
      'Appartement': {
        keywords: ['appartement', 'logement', 'loyer', 'edf', 'eau', 'internet box', 'assurance habitation', 'déménagement', 'travaux maison'],
        weight: 1.5
      },
      'Véhicules': {
        keywords: ['voiture', 'moto', 'trottinette', 'véhicule', 'assurance auto', 'contrôle technique', 'vidange', 'réparation voiture', 'garage', 'pneu', 'filtre essence'],
        weight: 1.5
      },
      'Famille': {
        keywords: ['famille', 'maman', 'papa', 'frère', 'sœur', 'parents', 'anniversaire famille', 'repas famille', 'visite famille'],
        weight: 1.5
      },
      '📞Appels de la famille': {
        keywords: ['appeler maman', 'appeler papa', 'appeler famille', 'téléphoner famille', 'call famille'],
        weight: 2.0
      },
      'Partenaire': {
        keywords: ['copine', 'girlfriend', 'couple', 'date', 'rendez-vous amoureux', 'cadeau copine', 'anniversaire copine'],
        weight: 1.5
      },
      'Hobbies': {
        keywords: ['hobby', 'loisir', 'passion', 'jeu vidéo', 'gaming', 'lecture plaisir', 'série', 'film', 'musique'],
        weight: 1.2
      },
      'achats': {
        keywords: ['acheter', 'commander', 'shopping', 'amazon', 'achat en ligne', 'livraison', 'colis'],
        weight: 1.3
      },
      '💰 À vendre': {
        keywords: ['vendre', 'vente', 'leboncoin', 'marketplace', 'revendre', 'occasion'],
        weight: 1.5
      },
      'Voyage Philipppines': {
        keywords: ['philippines', 'voyage', 'billet avion', 'hôtel', 'visa', 'valise', 'itinéraire voyage'],
        weight: 2.0
      },
      'boîte à idées': {
        keywords: ['idée', 'brainstorm', 'projet futur', 'concept', 'inspiration', 'à explorer'],
        weight: 1.0
      },
      'projets futurs': {
        keywords: ['futur', 'long terme', 'un jour', 'plus tard', 'éventuellement', 'projet ambitieux'],
        weight: 1.0
      },
      'test d\'applications': {
        keywords: ['tester app', 'application test', 'essayer', 'demo', 'trial', 'évaluation outil'],
        weight: 1.5
      },
      '🗃 Organiser ma vie': {
        keywords: ['organisation', 'planification', 'todo', 'tâches ménage', 'ranger', 'trier', 'classer', 'optimisation vie'],
        weight: 1.3
      },
      'autres': {
        keywords: ['divers', 'autre', 'inclassable', 'vrac'],
        weight: 0.5
      }
    };
  }

  /**
   * Charger les projets TickTick depuis l'API
   */
  async loadProjects(ticktickApi) {
    this.projects = await ticktickApi.getProjects();
    logger.info(`📁 ${this.projects.length} projets TickTick chargés pour classification`);
  }

  /**
   * Classifier une tâche dans le meilleur projet (mode principal)
   * @param {Object} task - Tâche à classifier
   * @param {boolean} useLLM - Forcer l'utilisation du LLM même si règles match
   * @returns {string|null} - ID du projet optimal, ou null si aucun
   */
  async classifyTask(task, useLLM = true) {
    if (this.projects.length === 0) {
      throw new Error('Projects not loaded. Call loadProjects() first.');
    }

    // Mode LLM si disponible et demandé
    if (this.anthropic && useLLM) {
      try {
        return await this.classifyWithLLM(task);
      } catch (error) {
        logger.warn(`LLM classification failed for task ${task.id}, falling back to rules:`, error.message);
        return this.classifyWithRules(task);
      }
    }

    // Mode règles intelligentes (fallback)
    return this.classifyWithRules(task);
  }

  /**
   * Classification via LLM (Claude Sonnet) - Analyse contextuelle précise
   */
  async classifyWithLLM(task) {
    const projectsList = this.projects
      .map(p => `- [${p.id}] ${p.name}`)
      .join('\n');

    const prompt = `Tu es un assistant d'organisation ultra-précis. Analyse cette tâche et détermine le MEILLEUR projet TickTick où la placer.

**TÂCHE À CLASSIFIER:**
- Titre: "${task.title}"
${task.content ? `- Description: "${task.content}"` : ''}
${task.tags && task.tags.length > 0 ? `- Tags: ${task.tags.join(', ')}` : ''}
${task.priority ? `- Priorité: ${task.priority}` : ''}

**PROJETS DISPONIBLES:**
${projectsList}

**CONTEXTE UTILISATEUR (Jérémy - Plus de Clients):**
- Entrepreneur génération de prospects B2B
- Crée des formations et outils automation
- Gère site Plus-de-clients.fr (lead generation)
- Lance sa société (SASU avec Indy)
- Sportif régulier (musculation/fitness)
- Vie perso: famille, copine, véhicules, appartement

**INSTRUCTIONS:**
1. Analyse le titre, la description et les tags
2. Détecte le contexte business/perso/technique
3. Identifie les mots-clés pertinents
4. Choisis le projet LE PLUS SPÉCIFIQUE possible
5. Si plusieurs projets matchent, prends le plus précis (ex: "🚀 Création d'entreprise" > "Professionnel")
6. Si vraiment aucun match, utilise "Professionnel" pour business, "autres" pour perso inclassable

**RÉPONSE ATTENDUE (format JSON uniquement):**
{
  "projectId": "ID_DU_PROJET",
  "projectName": "Nom du projet",
  "confidence": 0.95,
  "reasoning": "Explication courte (1 phrase)"
}

Ne retourne QUE le JSON, rien d'autre.`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      temperature: 0,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const result = JSON.parse(response.content[0].text);

    logger.info(`🧠 LLM Classification: "${task.title.substring(0, 40)}..." → ${result.projectName} (confidence: ${result.confidence})`);
    logger.debug(`   Reasoning: ${result.reasoning}`);

    return result.projectId;
  }

  /**
   * Classification via règles sémantiques intelligentes (fallback)
   */
  classifyWithRules(task) {
    const taskText = `${task.title} ${task.content || ''} ${task.tags ? task.tags.join(' ') : ''}`.toLowerCase();

    let bestMatch = null;
    let bestScore = 0;

    // Calculer score pour chaque projet
    for (const [projectName, rule] of Object.entries(this.semanticRules)) {
      let score = 0;
      let matchedKeywords = [];

      for (const keyword of rule.keywords) {
        if (taskText.includes(keyword.toLowerCase())) {
          score += rule.weight;
          matchedKeywords.push(keyword);
        }
      }

      // Bonus si le nom du projet apparaît dans la tâche
      if (taskText.includes(projectName.toLowerCase().replace(/[🚀📈⚙🤝🎓🎥🤖💰📞🗃]/g, '').trim())) {
        score += 2.0;
        matchedKeywords.push(`nom projet: "${projectName}"`);
      }

      if (score > bestScore) {
        bestScore = score;
        const project = this.projects.find(p => p.name === projectName);
        if (project) {
          bestMatch = {
            projectId: project.id,
            projectName: project.name,
            score,
            matchedKeywords
          };
        }
      }
    }

    if (bestMatch) {
      logger.info(`📋 Rules Classification: "${task.title.substring(0, 40)}..." → ${bestMatch.projectName} (score: ${bestMatch.score.toFixed(2)})`);
      logger.debug(`   Matched: ${bestMatch.matchedKeywords.join(', ')}`);
      return bestMatch.projectId;
    }

    // Fallback: garder le projet actuel si aucun match
    logger.debug(`⚠️ No classification match for: "${task.title.substring(0, 40)}..." - keeping current project`);
    return null;
  }

  /**
   * Classifier un batch de tâches (optimisé pour performance)
   */
  async classifyBatch(tasks, useLLM = true) {
    const results = [];

    for (const task of tasks) {
      try {
        const projectId = await this.classifyTask(task, useLLM);
        results.push({
          taskId: task.id,
          taskTitle: task.title,
          currentProjectId: task.projectId,
          suggestedProjectId: projectId,
          shouldMove: projectId && projectId !== task.projectId
        });
      } catch (error) {
        logger.error(`Erreur classification tâche ${task.id}:`, error.message);
        results.push({
          taskId: task.id,
          taskTitle: task.title,
          error: error.message,
          shouldMove: false
        });
      }
    }

    return results;
  }
}

module.exports = TaskProjectClassifier;

const Groq = require('groq-sdk');
const TickTickAPI = require('../api/ticktick-api');
const GoogleCalendarAPI = require('../api/google-calendar-api');
const AirtableAPI = require('../api/airtable-api');
const IntelligentScheduler = require('../orchestrator/intelligent-scheduler');
const TaskProjectClassifier = require('../orchestrator/task-project-classifier');
const { MISSION_CONTEXT } = require('./mission-context');
const logger = require('../utils/logger');

/**
 * LLM Intelligent Agent - Superintelligence pour gérer TickTick
 *
 * Utilise GROQ (Llama 3.1 70B) - 100% gratuit
 * Connaît la mission Plus-de-Clients
 * A accès à TOUS les outils
 */
class IntelligentAgent {
  constructor() {
    this.groq = null;
    this.ticktick = new TickTickAPI();
    this.googleCalendar = new GoogleCalendarAPI();
    this.airtable = new AirtableAPI();
    this.scheduler = new IntelligentScheduler();
    this.classifier = new TaskProjectClassifier();

    // Historique de conversation
    this.conversationHistory = [];

    // Cache du contexte (2 minutes) pour éviter appels API répétés
    this.contextCache = null;
    this.contextCacheTimestamp = 0;
    this.CACHE_TTL = 120000; // 2 minutes (pour éviter rate limit TickTick)
  }

  async initialize() {
    try {
      // Initialiser GROQ
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        throw new Error('GROQ_API_KEY non configurée dans .env');
      }

      this.groq = new Groq({ apiKey });

      // Initialiser les APIs
      await this.airtable.initialize();
      await this.ticktick.loadTokens();
      await this.googleCalendar.loadTokens();
      await this.scheduler.initialize();

      logger.info('IntelligentAgent initialisé avec GROQ (Llama 3.3 70B)');
      return true;
    } catch (error) {
      logger.error('Erreur initialisation IntelligentAgent:', error.message);
      return false;
    }
  }

  /**
   * Fonction principale - Traite une commande en langage naturel
   */
  async processCommand(userMessage) {
    try {
      logger.info(`💬 Commande reçue: "${userMessage}"`);

      // 1. Analyser le contexte actuel (tâches, calendrier, prospects)
      const context = await this.gatherContext();

      // 2. Construire le prompt pour le LLM
      const messages = this.buildMessages(userMessage, context);

      // 3. Appeler GROQ pour analyser et décider des actions
      const completion = await this.groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile', // Nouveau modèle GROQ (remplace llama-3.1)
        messages,
        temperature: 0.3, // Précis, moins créatif
        max_tokens: 2000,
        top_p: 1
      });

      const llmResponse = completion.choices[0]?.message?.content || '';
      logger.info(`🤖 Réponse LLM: ${llmResponse.substring(0, 200)}...`);

      // 4. Extraire les actions du LLM
      const actions = this.extractActions(llmResponse);

      // 5. Exécuter les actions
      const results = await this.executeActions(actions);

      // 6. Construire réponse finale
      return {
        success: true,
        llmResponse,
        actions,
        results,
        summary: this.generateSummary(results)
      };

    } catch (error) {
      logger.error('Erreur processCommand:', error.message);
      return {
        success: false,
        error: error.message,
        llmResponse: `Erreur: ${error.message}`
      };
    }
  }

  /**
   * Rassemble le contexte actuel (tâches, calendrier, prospects)
   * Avec cache de 30s pour éviter appels API répétés
   */
  async gatherContext() {
    try {
      // Vérifier le cache
      const now = Date.now();
      if (this.contextCache && (now - this.contextCacheTimestamp) < this.CACHE_TTL) {
        logger.info('Contexte récupéré depuis le cache');
        return this.contextCache;
      }

      logger.info('Récupération du contexte (TickTick + Airtable + Calendar en parallèle)...');

      // Récupération EN PARALLÈLE pour gagner du temps
      const [tasksActive, tasksCompleted, prospects, calendarEvents] = await Promise.all([
        // Tâches TickTick actives
        this.ticktick.getTasks(null, false).catch(err => {
          logger.error('Erreur getTasks actives:', err.message);
          return [];
        }),

        // Tâches TickTick complétées
        this.ticktick.getTasks(null, true).catch(err => {
          logger.error('Erreur getTasks complétées:', err.message);
          return [];
        }),

        // Prospects Airtable
        this.airtable.getProspects().catch(err => {
          logger.error('Erreur getProspects:', err.message);
          return [];
        }),

        // Événements Calendar (7 prochains jours)
        (async () => {
          try {
            const today = new Date();
            const nextWeek = new Date(today);
            nextWeek.setDate(today.getDate() + 7);
            const calendarId = process.env.GOOGLE_CALENDAR_ID || process.env.GOOGLE_JEREMY_CALENDAR_ID;
            if (calendarId) {
              return await this.googleCalendar.getEvents(calendarId, today, nextWeek);
            }
            return [];
          } catch (error) {
            logger.warn('Impossible de récupérer événements Calendar:', error.message);
            return [];
          }
        })()
      ]);

      // Fusionner toutes les tâches
      const allTasks = [...tasksActive, ...tasksCompleted];

      // Traitement des tâches
      const tasksWithoutDate = tasksActive.filter(t => !t.dueDate);

      // Traitement des prospects
      const nowTimestamp = Date.now();
      const urgentProspects = prospects.filter(p => {
        const lastContact = new Date(p.fields['Dernière modification'] || 0);
        const daysSince = Math.floor((nowTimestamp - lastContact) / (1000 * 60 * 60 * 24));
        return daysSince > 15;
      });

      const context = {
        stats: {
          totalTasks: allTasks.length,
          activeTasks: tasksActive.length,
          tasksWithoutDate: tasksWithoutDate.length,
          totalProspects: prospects.length,
          urgentProspects: urgentProspects.length,
          upcomingEvents: calendarEvents.length
        },
        allTasks: allTasks, // TOUTES les tâches pour delete/update
        tasks: allTasks.slice(0, 50), // Max 50 pour le prompt LLM
        tasksWithoutDate: tasksWithoutDate.slice(0, 20),
        urgentProspects: urgentProspects.slice(0, 10),
        upcomingEvents: calendarEvents.slice(0, 10)
      };

      // Mettre en cache
      this.contextCache = context;
      this.contextCacheTimestamp = Date.now();

      logger.info('Contexte récupéré et mis en cache');
      return context;

    } catch (error) {
      logger.error('Erreur gatherContext:', error.message);
      return {
        stats: {},
        tasks: [],
        tasksWithoutDate: [],
        urgentProspects: [],
        upcomingEvents: []
      };
    }
  }

  /**
   * Construit les messages pour GROQ
   */
  buildMessages(userMessage, context) {
    const systemPrompt = `${MISSION_CONTEXT}

# CONTEXTE ACTUEL

**Statistiques:**
- Total tâches: ${context.stats.totalTasks}
- Tâches actives: ${context.stats.activeTasks}
- Tâches sans date: ${context.stats.tasksWithoutDate}
- Prospects urgents (>15j): ${context.stats.urgentProspects}
- Événements 7 jours: ${context.stats.upcomingEvents}

**Tâches sans date:** ${context.tasksWithoutDate.length > 0 ? context.tasksWithoutDate.map(t => `\n- "${t.title}" (ID: ${t.id}, Projet: ${t.projectId})`).join('') : 'Aucune'}

**Tâches actives (échantillon):** ${context.tasks.length > 0 ? context.tasks.slice(0, 10).map(t => `\n- "${t.title}" (ID: ${t.id}, Projet: ${t.projectId}${t.dueDate ? ', Due: ' + new Date(t.dueDate).toISOString().split('T')[0] : ''})`).join('') : 'Aucune'}

**Prospects urgents:** ${context.urgentProspects.length > 0 ? context.urgentProspects.map(p => `\n- ${p.fields['Prénom']} ${p.fields['Nom']} (${Math.floor((Date.now() - new Date(p.fields['Dernière modification'])) / (1000*60*60*24))}j)`).join('') : 'Aucun'}

---

# ACTIONS DISPONIBLES

Réponds en JSON avec ce format:

\`\`\`json
{
  "analysis": "Ton analyse de la situation",
  "actions": [
    {
      "type": "create_task|update_task|delete_task|run_orchestrator|create_event|classify_tasks",
      "params": { ... },
      "reason": "Pourquoi cette action"
    }
  ],
  "summary": "Résumé de ce qui va être fait"
}
\`\`\`

**Types d'actions disponibles:**

1. **create_task**: Créer une tâche TickTick
   \`params: { title, content, projectId, priority, dueDate, isAllDay, tags }\`
   **RÈGLES CRITIQUES DUEDATE:**
   - Si l'utilisateur mentionne "aujourd'hui", "demain", ou une date → OBLIGATOIRE d'ajouter \`dueDate\`
   - TOUJOURS utiliser \`isAllDay: true\` sauf si heure précise demandée explicitement
   - Format dueDate: "YYYY-MM-DD" seulement (ex: "2025-10-16")
   - NE JAMAIS mettre d'horaire (pas de "T00:00:00" ni "T10:30:00") sauf demande explicite
   - Si "aujourd'hui": calculer la date du jour (${new Date().toISOString().split('T')[0]})
   - Si "demain": ajouter 1 jour à aujourd'hui

2. **update_task**: Modifier une tâche (utiliser RAREMENT, seulement si explicitement demandé)
   \`params: { taskId, updates: { dueDate, priority, projectId, ... } }\` OU \`params: { title: "titre", updates: {...} }\`
   Note: Si title fourni, cherche automatiquement la tâche correspondante. L'orchestrateur gère déjà les priorités automatiquement

3. **delete_task**: Supprimer une tâche
   \`params: { taskId }\` OU \`params: { title: "titre de la tâche" }\`
   Note: Si title fourni, cherche automatiquement la tâche correspondante

4. **run_orchestrator**: Lancer orchestration intelligente (60 jours, classification, conflits) - ARRIÈRE-PLAN
   \`params: {}\`
   Note: Cette action est lancée en arrière-plan et prend ~5-10 minutes

5. **create_event**: Créer événement Google Calendar (UNIQUEMENT si explicitement demandé)
   \`params: { title, start, end, description }\`
   Note: start/end au format ISO 8601 (ex: "2025-10-15T14:00:00+02:00")

6. **classify_tasks**: Reclassifier tâches dans bons projets - ARRIÈRE-PLAN
   \`params: { taskIds: [] }\` ou \`params: {}\` pour toutes
   Note: Cette action est lancée en arrière-plan et prend ~3-5 minutes

**RÈGLES IMPORTANTES:**
- Pour redistribuer/rééquilibrer la charge: utilise UNIQUEMENT run_orchestrator + classify_tasks
- NE PAS utiliser update_task pour changer les priorités (l'orchestrateur le fait automatiquement)
- update_task est UNIQUEMENT pour des modifications explicites demandées par l'utilisateur
- NE PAS créer d'événements Calendar à moins que l'utilisateur le demande explicitement
- Pour des sessions de travail/appels: suggérer dans l'analyse mais NE PAS créer automatiquement

IMPORTANT: Réponds UNIQUEMENT en JSON valide, sans texte avant ou après.
`;

    return [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userMessage
      }
    ];
  }

  /**
   * Extrait les actions du JSON retourné par le LLM
   */
  extractActions(llmResponse) {
    try {
      // Trouver le JSON dans la réponse
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('Pas de JSON trouvé dans la réponse LLM');
        return {
          analysis: llmResponse,
          actions: [],
          summary: llmResponse
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        analysis: parsed.analysis || '',
        actions: parsed.actions || [],
        summary: parsed.summary || ''
      };
    } catch (error) {
      logger.error('Erreur extractActions:', error.message);
      return {
        analysis: llmResponse,
        actions: [],
        summary: 'Erreur parsing réponse LLM'
      };
    }
  }

  /**
   * Exécute les actions décidées par le LLM
   */
  async executeActions(actionsPlan) {
    const results = [];

    for (const action of actionsPlan.actions || []) {
      try {
        logger.info(`🔧 Exécution action: ${action.type}`);

        let result;
        switch (action.type) {
          case 'create_task':
            result = await this.createTask(action.params);
            break;

          case 'update_task':
            result = await this.updateTask(action.params);
            break;

          case 'delete_task':
            result = await this.deleteTask(action.params);
            break;

          case 'run_orchestrator':
            result = await this.runOrchestrator();
            break;

          case 'create_event':
            result = await this.createEvent(action.params);
            break;

          case 'classify_tasks':
            result = await this.classifyTasks(action.params);
            break;

          default:
            result = { success: false, error: `Action inconnue: ${action.type}` };
        }

        results.push({
          action: action.type,
          params: action.params,
          reason: action.reason,
          result
        });

        // ✅ CACHE GARDÉ - Le TTL de 2 minutes suffit pour éviter rate limit
        // L'invalidation systématique forçait 52+ requêtes API (26 projets × 2) après chaque action
        // Maintenant le cache reste valide jusqu'à expiration naturelle (2min)

      } catch (error) {
        logger.error(`Erreur exécution action ${action.type}:`, error.message);
        results.push({
          action: action.type,
          params: action.params,
          reason: action.reason,
          result: { success: false, error: error.message }
        });
      }
    }

    return results;
  }

  // === ACTIONS INDIVIDUELLES ===

  async createTask(params) {
    try {
      // Si aucun projectId fourni, utiliser le projet par défaut pour éviter l'Inbox invisible
      if (!params.projectId) {
        const projects = await this.ticktick.getProjects();
        // Préférer "👋Welcome" ou "Professionnel", sinon prendre le premier
        const defaultProject = projects.find(p => p.name === '👋Welcome' || p.name === 'Professionnel') || projects[0];
        if (defaultProject) {
          params.projectId = defaultProject.id;
          logger.info(`📁 Aucun projet spécifié, utilisation de "${defaultProject.name}"`);
        }
      }

      // Par défaut isAllDay = true (sauf si explicitement false)
      const isAllDay = params.isAllDay !== false;

      // Format dueDate - API TickTick nécessite TOUJOURS format ISO complet
      let dueDate;
      if (params.dueDate) {
        // Extraire la partie date si format "YYYY-MM-DD" reçu du LLM
        const dateOnly = params.dueDate.split('T')[0];

        if (isAllDay) {
          // Tâche toute la journée: minuit en UTC
          dueDate = `${dateOnly}T00:00:00+0000`;
        } else {
          // Heure spécifique: utiliser l'heure fournie ou minuit par défaut
          dueDate = params.dueDate.includes('T')
            ? params.dueDate
            : `${dateOnly}T00:00:00+0000`;
        }
      }

      const task = await this.ticktick.createTask({
        title: params.title,
        content: params.content || '',
        projectId: params.projectId,
        priority: params.priority || 0,
        dueDate: dueDate,
        isAllDay: isAllDay,
        tags: params.tags || []
      });

      return {
        success: true,
        taskId: task.id,
        title: task.title
      };
    } catch (error) {
      logger.error('Erreur createTask:', error.message);
      return { success: false, error: error.message };
    }
  }

  async updateTask(params) {
    try {
      // Utiliser le contexte déjà récupéré pour éviter rate limit
      const context = await this.gatherContext();
      const allTasks = context.allTasks; // TOUTES les tâches (pas limitées à 50)

      let existingTask;

      // Si title fourni au lieu de taskId, chercher la tâche
      if (!params.taskId && params.title) {
        const searchTerm = params.title.toLowerCase();
        existingTask = allTasks.find(t =>
          t.title && t.title.toLowerCase().includes(searchTerm)
        );

        if (!existingTask) {
          return {
            success: false,
            error: `Aucune tâche trouvée contenant "${params.title}"`
          };
        }

        logger.info(`Tâche trouvée par titre: "${existingTask.title}" (ID: ${existingTask.id})`);
      } else {
        existingTask = allTasks.find(t => t.id === params.taskId);

        if (!existingTask) {
          throw new Error(`Tâche ${params.taskId} introuvable`);
        }
      }

      // Fusionner avec les updates (garder les champs obligatoires)
      const completeUpdate = {
        id: existingTask.id,
        projectId: existingTask.projectId,
        title: existingTask.title,
        dueDate: existingTask.dueDate,
        isAllDay: existingTask.isAllDay,
        ...params.updates // Les updates écrasent ce qui est nécessaire
      };

      await this.ticktick.updateTask(existingTask.id, completeUpdate);

      return {
        success: true,
        taskId: existingTask.id,
        message: 'Tâche mise à jour'
      };
    } catch (error) {
      logger.error('Erreur updateTask:', error.message);
      return { success: false, error: error.message };
    }
  }

  async deleteTask(params) {
    try {
      let taskId = params.taskId;

      // Si title fourni au lieu de taskId, chercher la tâche
      if (!taskId && params.title) {
        // Utiliser le contexte déjà récupéré pour éviter rate limit
        const context = await this.gatherContext();
        const allTasks = context.allTasks; // TOUTES les tâches

        const searchTerm = params.title.toLowerCase();
        const matchingTask = allTasks.find(t =>
          t.title && t.title.toLowerCase().includes(searchTerm)
        );

        if (!matchingTask) {
          return {
            success: false,
            error: `Aucune tâche trouvée contenant "${params.title}"`
          };
        }

        taskId = matchingTask.id;
        logger.info(`Tâche trouvée par titre: "${matchingTask.title}" (ID: ${taskId})`);
      }

      if (!taskId) {
        return { success: false, error: 'taskId ou title requis' };
      }

      await this.ticktick.deleteTask(taskId);
      return {
        success: true,
        taskId,
        message: 'Tâche supprimée avec succès'
      };
    } catch (error) {
      logger.error('Erreur deleteTask:', error.message);
      return { success: false, error: error.message };
    }
  }

  async runOrchestrator() {
    try {
      // Lancer en arrière-plan (ne pas attendre la fin)
      logger.info('🚀 Lancement orchestration en arrière-plan...');

      // Exécuter de manière asynchrone sans bloquer
      this.scheduler.performContinuousAdjustment()
        .then(result => {
          logger.info(`✅ Orchestration terminée: ${result.datesAssigned} dates, ${result.tasksReclassified} reclassifiées, ${result.tasksRescheduled} replanifiées`);
        })
        .catch(error => {
          logger.error('❌ Erreur orchestration background:', error.message);
        });

      // Répondre immédiatement
      return {
        success: true,
        message: 'Orchestration lancée en arrière-plan (60 jours)',
        background: true
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createEvent(params) {
    try {
      const calendarId = process.env.GOOGLE_CALENDAR_ID || process.env.GOOGLE_JEREMY_CALENDAR_ID || process.env.JEREMY_CALENDAR_ID;

      if (!calendarId) {
        throw new Error('Aucun Calendar ID configuré dans .env');
      }

      const event = await this.googleCalendar.createEvent(
        calendarId,
        {
          summary: params.title,
          description: params.description || '',
          start: { dateTime: params.start },
          end: { dateTime: params.end }
        }
      );

      return {
        success: true,
        eventId: event.id,
        title: event.summary,
        message: `Événement créé: ${event.summary}`
      };
    } catch (error) {
      logger.error('Erreur createEvent:', error.message);
      return { success: false, error: error.message };
    }
  }

  async classifyTasks(params) {
    try {
      logger.info('🗂️ Lancement classification en arrière-plan...');

      // Lancer en arrière-plan
      (async () => {
        try {
          await this.classifier.loadProjects(this.ticktick);

          let tasksToClassify;
          if (params.taskIds && params.taskIds.length > 0) {
            // Classifier tâches spécifiques
            const allTasks = await this.ticktick.getTasks();
            tasksToClassify = allTasks.filter(t => params.taskIds.includes(t.id));
          } else {
            // Classifier toutes les tâches actives
            const allTasks = await this.ticktick.getTasks();
            tasksToClassify = allTasks.filter(t => !t.isCompleted && t.status !== 2);
          }

          logger.info(`🗂️ Classification de ${tasksToClassify.length} tâches...`);

          let classified = 0;
          for (const task of tasksToClassify) {
            const suggestedProjectId = await this.classifier.classifyTask(task, false);
            if (suggestedProjectId && suggestedProjectId !== task.projectId) {
              await this.ticktick.updateTask(task.id, {
                id: task.id,
                projectId: suggestedProjectId,
                title: task.title,
                dueDate: task.dueDate,
                isAllDay: task.isAllDay
              });
              classified++;
            }
          }

          logger.info(`✅ Classification terminée: ${classified}/${tasksToClassify.length} tâches reclassifiées`);
        } catch (error) {
          logger.error('❌ Erreur classification background:', error.message);
        }
      })();

      // Répondre immédiatement
      return {
        success: true,
        message: 'Classification lancée en arrière-plan',
        background: true
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Génère un résumé lisible des résultats
   */
  generateSummary(results) {
    const successful = results.filter(r => r.result.success).length;
    const failed = results.filter(r => !r.result.success).length;
    const background = results.filter(r => r.result.success && r.result.background).length;

    let summary = `✅ ${successful} action(s) réussie(s)`;
    if (background > 0) {
      summary += ` (${background} en arrière-plan)`;
    }
    if (failed > 0) {
      summary += `, ❌ ${failed} échouée(s)`;
    }

    const details = results.map(r => {
      if (r.result.success) {
        const bgLabel = r.result.background ? ' [arrière-plan]' : '';
        const msg = r.result.message || r.reason;
        return `✅ ${r.action}${bgLabel}: ${msg}`;
      } else {
        return `❌ ${r.action}: ${r.result.error}`;
      }
    }).join('\n');

    return `${summary}\n\n${details}`;
  }
}

module.exports = IntelligentAgent;

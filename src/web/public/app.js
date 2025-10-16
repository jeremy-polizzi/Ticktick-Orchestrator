// TickTick Orchestrator - Frontend Application
class OrchestratorApp {
    constructor() {
        this.isAuthenticated = false;
        this.init();
    }

    async init() {
        // Vérifier l'authentification au démarrage
        await this.checkAuth();

        // Setup event listeners
        this.setupEventListeners();

        // Charger les données initiales si authentifié
        if (this.isAuthenticated) {
            await this.loadDashboard();
        } else {
            this.showLoginModal();
        }
    }

    setupEventListeners() {
        // Login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.login();
            });
        }

        // Natural command input
        const naturalCommand = document.getElementById('naturalCommand');
        if (naturalCommand) {
            naturalCommand.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.executeCommand();
                }
            });
        }

        // Tab switching - Both Bootstrap events AND manual click handling
        document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
            // Bootstrap tab event
            tab.addEventListener('shown.bs.tab', (e) => {
                const targetTab = e.target.getAttribute('data-bs-target').substring(1);
                console.log('Bootstrap tab switch to:', targetTab);
                this.handleTabSwitch(targetTab);
            });

            // Manual click event as fallback
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                const targetTab = e.target.getAttribute('data-bs-target')?.substring(1) ||
                                e.target.closest('[data-bs-target]')?.getAttribute('data-bs-target')?.substring(1);

                if (targetTab) {
                    console.log('Manual tab click to:', targetTab);

                    // Remove active class from all tabs and content
                    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
                    document.querySelectorAll('.tab-pane').forEach(pane => {
                        pane.classList.remove('show', 'active');
                    });

                    // Add active class to clicked tab and target content
                    e.target.classList.add('active');
                    const targetContent = document.getElementById(targetTab);
                    if (targetContent) {
                        targetContent.classList.add('show', 'active');
                    }

                    // Load tab content
                    this.handleTabSwitch(targetTab);
                }
            });
        });

        // Auto-refresh every 2 minutes (pour éviter rate limiting)
        setInterval(() => {
            if (this.isAuthenticated) {
                this.refreshCurrentTab();
            }
        }, 120000);
    }

    // === AUTHENTICATION ===

    async checkAuth() {
        try {
            const response = await this.apiCall('/auth/verify', 'GET');
            this.isAuthenticated = response.valid;
        } catch (error) {
            console.error('Auth check failed:', error);
            this.isAuthenticated = false;
        }

        this.updateAuthUI();
    }

    async login() {
        const password = document.getElementById('password').value;
        const spinner = document.getElementById('loginSpinner');

        if (!password) {
            this.showAlert('Mot de passe requis', 'warning');
            return;
        }

        spinner.classList.remove('d-none');

        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password })
            });

            const data = await response.json();

            if (data.success) {
                this.isAuthenticated = true;

                // Hide login modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
                modal.hide();

                // Load dashboard
                await this.loadDashboard();
                this.updateAuthUI();
                this.showAlert('Connexion réussie', 'success');
            } else {
                this.showAlert(data.error || 'Erreur de connexion', 'danger');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showAlert('Erreur de connexion', 'danger');
        } finally {
            spinner.classList.add('d-none');
        }
    }

    async logout() {
        try {
            await this.apiCall('/auth/logout', 'POST');
        } catch (error) {
            console.error('Erreur logout:', error);
        }

        this.isAuthenticated = false;
        this.updateAuthUI();
        this.showLoginModal();
        this.showAlert('Déconnecté avec succès', 'info');
    }

    goToConfig() {
        console.log('goToConfig() appelée');
        console.log('Authentifié:', this.isAuthenticated);

        // Rediriger vers la page de configuration
        if (this.isAuthenticated) {
            console.log('Redirection vers: /config');
            window.location.href = '/config';
        } else {
            console.log('Pas authentifié, affichage modal login');
            this.showLoginModal();
        }
    }

    goHome() {
        console.log('goHome() appelée');
        // Rediriger vers l'accueil
        if (this.isAuthenticated) {
            console.log('Redirection vers: /');
            window.location.href = '/';
        } else {
            console.log('Pas authentifié, affichage modal login');
            this.showLoginModal();
        }
    }

    showLoginModal() {
        const modal = new bootstrap.Modal(document.getElementById('loginModal'));
        modal.show();
    }

    updateAuthUI() {
        const authStatus = document.getElementById('authStatus');
        if (this.isAuthenticated) {
            authStatus.classList.add('d-none');
        } else {
            authStatus.classList.remove('d-none');
        }
    }

    // === API CALLS ===

    async apiCall(endpoint, method = 'GET', data = null) {
        const config = {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'  // Inclure les cookies dans les requêtes
        };

        if (data && method !== 'GET') {
            config.body = JSON.stringify(data);
        }

        const response = await fetch(endpoint, config);

        if (response.status === 401) {
            this.logout();
            throw new Error('Authentification requise');
        }

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Erreur API');
        }

        return result;
    }

    // === DASHBOARD ===

    async loadDashboard() {
        try {
            // Charger les statuts des services
            await this.loadServiceStatus();

            // Charger l'état du système (NOUVEAU)
            await this.updateSystemStatus();

            // Charger les statistiques
            await this.loadStats();

            // Afficher l'historique LLM
            this.displayLLMHistory();

            // Démarrer auto-refresh temps réel
            this.startSystemStatusAutoRefresh();

        } catch (error) {
            console.error('Error loading dashboard:', error);
            this.showAlert('Erreur lors du chargement du dashboard', 'danger');
        }
    }

    startSystemStatusAutoRefresh() {
        // Clear ancien interval si existe
        if (this.systemStatusInterval) {
            clearInterval(this.systemStatusInterval);
        }

        // Refresh toutes les 5 secondes
        this.systemStatusInterval = setInterval(async () => {
            if (this.isAuthenticated) {
                await this.updateSystemStatus();
            }
        }, 5000);
    }

    async updateSystemStatus() {
        try {
            // Appeler l'API status du scheduler
            const status = await this.apiCall('/api/scheduler/status');

            // 1. État Serveur
            const serverEl = document.getElementById('systemServerStatus');
            if (serverEl) {
                serverEl.innerHTML = `
                    <span class="status-indicator status-connected"></span>
                    <span><strong>Actif</strong></span>
                `;
            }

            // 2. État Orchestrateur
            const orchestratorEl = document.getElementById('systemOrchestratorStatus');
            if (orchestratorEl && status.scheduler) {
                const isActive = status.scheduler.isActive;
                const isRunning = status.scheduler.isRunning;

                if (isRunning) {
                    orchestratorEl.innerHTML = `
                        <span class="status-indicator" style="background: #ffc107; box-shadow: 0 0 6px rgba(255, 193, 7, 0.5);"></span>
                        <span><strong>En cours...</strong></span>
                    `;
                } else if (isActive) {
                    orchestratorEl.innerHTML = `
                        <span class="status-indicator status-connected"></span>
                        <span><strong>Actif</strong></span>
                    `;
                } else {
                    orchestratorEl.innerHTML = `
                        <span class="status-indicator status-disconnected"></span>
                        <span><strong>Inactif</strong></span>
                    `;
                }
            }

            // 3. Activité en cours
            const activityEl = document.getElementById('systemCurrentActivity');
            if (activityEl && status.activity) {
                if (status.activity.currentActivity && status.activity.currentActivity.status === 'in_progress') {
                    const activity = status.activity.currentActivity;
                    activityEl.innerHTML = `
                        <small><strong>${activity.type}</strong></small><br>
                        <small class="text-muted">${activity.description || ''}</small>
                    `;

                    // Afficher barre de progression
                    const progressBar = document.getElementById('systemProgressBar');
                    const progressLabel = document.getElementById('systemProgressLabel');
                    const progressBarInner = document.getElementById('systemProgressBarInner');

                    if (progressBar && progressLabel && progressBarInner) {
                        progressBar.classList.remove('d-none');
                        const progress = activity.progress || 0;
                        progressLabel.textContent = `Progression: ${progress}%`;
                        progressBarInner.style.width = `${progress}%`;
                        progressBarInner.textContent = `${progress}%`;
                        progressBarInner.setAttribute('aria-valuenow', progress);
                    }

                    // Afficher aussi dans la zone "Activités en arrière-plan"
                    this.updateBackgroundActivities(activity);
                } else {
                    activityEl.innerHTML = `<small class="text-muted">Aucune activité</small>`;

                    // Cacher barre de progression
                    const progressBar = document.getElementById('systemProgressBar');
                    if (progressBar) {
                        progressBar.classList.add('d-none');
                    }

                    // Cacher les activités en arrière-plan
                    this.hideBackgroundActivities();
                }
            }

            // 4. Santé système
            const healthEl = document.getElementById('systemHealth');
            if (healthEl && status.connections) {
                const ticktick = status.connections.ticktick;
                const google = status.connections.google;
                const overall = ticktick && google;

                if (overall) {
                    healthEl.innerHTML = `
                        <span class="status-indicator status-connected"></span>
                        <span><strong>Excellent</strong></span>
                    `;
                } else if (ticktick || google) {
                    healthEl.innerHTML = `
                        <span class="status-indicator" style="background: #ffc107;"></span>
                        <span><strong>Partiel</strong></span>
                    `;
                } else {
                    healthEl.innerHTML = `
                        <span class="status-indicator status-disconnected"></span>
                        <span><strong>Problème</strong></span>
                    `;
                }
            }

            // 5. Dernière exécution
            const lastRunEl = document.getElementById('systemLastRun');
            if (lastRunEl && status.scheduler && status.scheduler.lastRun) {
                const lastRun = new Date(status.scheduler.lastRun);
                const now = new Date();
                const diffMs = now - lastRun;
                const diffMins = Math.floor(diffMs / 60000);

                let timeAgo = '';
                if (diffMins < 1) {
                    timeAgo = 'À l\'instant';
                } else if (diffMins < 60) {
                    timeAgo = `Il y a ${diffMins} min`;
                } else {
                    const hours = Math.floor(diffMins / 60);
                    timeAgo = `Il y a ${hours}h${diffMins % 60}min`;
                }

                lastRunEl.innerHTML = `
                    <small>${lastRun.toLocaleString('fr-FR')}</small><br>
                    <small class="text-muted">${timeAgo}</small>
                `;
            } else if (lastRunEl) {
                lastRunEl.innerHTML = `<small class="text-muted">Jamais</small>`;
            }

            // 6. Prochaine exécution
            const nextRunEl = document.getElementById('systemNextRun');
            if (nextRunEl && status.scheduler && status.scheduler.nextRun) {
                const nextRun = new Date(status.scheduler.nextRun);
                const now = new Date();
                const diffMs = nextRun - now;
                const diffMins = Math.floor(diffMs / 60000);

                let timeUntil = '';
                if (diffMins < 60) {
                    timeUntil = `Dans ${diffMins} min`;
                } else {
                    const hours = Math.floor(diffMins / 60);
                    timeUntil = `Dans ${hours}h${diffMins % 60}min`;
                }

                nextRunEl.innerHTML = `
                    <small>${nextRun.toLocaleString('fr-FR')}</small><br>
                    <small class="text-muted">${timeUntil}</small>
                `;
            } else if (nextRunEl) {
                nextRunEl.innerHTML = `<small class="text-muted">Non programmée</small>`;
            }

        } catch (error) {
            console.error('Erreur updateSystemStatus:', error);

            // Afficher erreur dans le dashboard
            const serverEl = document.getElementById('systemServerStatus');
            if (serverEl) {
                serverEl.innerHTML = `
                    <span class="status-indicator status-disconnected"></span>
                    <span><strong>Erreur</strong></span>
                `;
            }
        }
    }

    updateBackgroundActivities(activity) {
        const bgActivitiesDiv = document.getElementById('backgroundActivities');
        const bgActivitiesList = document.getElementById('backgroundActivitiesList');

        if (!bgActivitiesDiv || !bgActivitiesList) return;

        // Afficher la zone
        bgActivitiesDiv.style.display = 'block';

        // Construire le HTML de l'activité
        const activityTypeLabel = {
            'continuous_adjustment': '🔄 Rééquilibrage sur 60 jours',
            'classification': '🗂️ Reclassification des tâches',
            'date_assignment': '📅 Attribution des dates',
            'conflict_resolution': '⚠️ Résolution des conflits'
        };

        const label = activityTypeLabel[activity.type] || activity.description || activity.type;
        const progress = activity.progress || 0;

        bgActivitiesList.innerHTML = `
            <div class="d-flex align-items-center gap-3">
                <div class="spinner-border spinner-border-sm text-primary" role="status">
                    <span class="visually-hidden">Chargement...</span>
                </div>
                <div class="flex-grow-1">
                    <div><strong>${label}</strong></div>
                    <div class="progress mt-2" style="height: 20px;">
                        <div class="progress-bar progress-bar-striped progress-bar-animated"
                             role="progressbar"
                             style="width: ${progress}%"
                             aria-valuenow="${progress}"
                             aria-valuemin="0"
                             aria-valuemax="100">${progress}%</div>
                    </div>
                </div>
            </div>
        `;
    }

    showBackgroundActivityPlaceholder() {
        const bgActivitiesDiv = document.getElementById('backgroundActivities');
        const bgActivitiesList = document.getElementById('backgroundActivitiesList');

        if (!bgActivitiesDiv || !bgActivitiesList) return;

        bgActivitiesDiv.style.display = 'block';
        bgActivitiesList.innerHTML = `
            <div class="d-flex align-items-center gap-3">
                <div class="spinner-border spinner-border-sm text-primary" role="status">
                    <span class="visually-hidden">Chargement...</span>
                </div>
                <div class="flex-grow-1">
                    <div><strong>⏳ Démarrage de l'orchestration en arrière-plan...</strong></div>
                    <small class="text-muted">Le traitement va commencer dans quelques secondes</small>
                </div>
            </div>
        `;
    }

    hideBackgroundActivities() {
        const bgActivitiesDiv = document.getElementById('backgroundActivities');
        const bgActivitiesList = document.getElementById('backgroundActivitiesList');

        if (bgActivitiesDiv && bgActivitiesList) {
            // Afficher un message de succès pendant 5 secondes avant de cacher
            if (bgActivitiesDiv.style.display !== 'none') {
                bgActivitiesList.innerHTML = `
                    <div class="d-flex align-items-center gap-3 text-success">
                        <i class="bi bi-check-circle-fill"></i>
                        <div><strong>✅ Activité terminée avec succès !</strong></div>
                    </div>
                `;

                // Cacher après 5 secondes
                setTimeout(() => {
                    bgActivitiesDiv.style.display = 'none';
                    this.showAlert('Rééquilibrage terminé ! Tes tâches sont maintenant réparties sur 60 jours.', 'success');
                }, 5000);
            }
        }
    }

    async loadServiceStatus() {
        try {
            // Status TickTick
            const ticktickStatus = await this.apiCall('/auth/ticktick/status');
            this.updateStatusIndicator('ticktickStatus', ticktickStatus.connected, 'TickTick');

            // Status Google Calendar
            const googleStatus = await this.apiCall('/auth/google/status');
            this.updateStatusIndicator('googleStatus', googleStatus.connected, 'Google Calendar');

            // Status Scheduler
            const schedulerStatus = await this.apiCall('/api/scheduler/status');
            this.updateStatusIndicator('schedulerStatus', schedulerStatus.success, 'Scheduler');

        } catch (error) {
            console.error('Error loading service status:', error);
        }
    }

    updateStatusIndicator(elementId, isConnected, serviceName) {
        const element = document.getElementById(elementId);
        const indicator = element.querySelector('.status-indicator');
        const text = element.querySelector('span:last-child');

        indicator.className = 'status-indicator';
        if (isConnected) {
            indicator.classList.add('status-connected');
            text.textContent = 'Connecté';
        } else {
            indicator.classList.add('status-disconnected');
            text.textContent = 'Déconnecté';
        }
    }

    async loadStats() {
        try {
            const stats = await this.apiCall('/api/tasks/stats/overview');

            if (stats.success) {
                document.getElementById('totalTasks').textContent = stats.stats.total || 0;
                document.getElementById('pendingTasks').textContent = stats.stats.pending || 0;
                document.getElementById('todayTasks').textContent = stats.stats.today || 0;
            }

            // Sync stats
            const syncStats = await this.apiCall('/api/calendar/sync/status');
            if (syncStats.success) {
                document.getElementById('syncedEvents').textContent = syncStats.mappings || 0;
            }

        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    // === NATURAL LANGUAGE COMMANDS ===

    async executeCommand() {
        const commandInput = document.getElementById('naturalCommand');
        const command = commandInput.value.trim();
        const resultDiv = document.getElementById('commandResult');

        if (!command) {
            this.showAlert('Veuillez saisir une commande', 'warning');
            return;
        }

        // NE PAS bloquer le dashboard avec showLoading()
        // Afficher le spinner localement dans la zone de résultat
        resultDiv.innerHTML = `
            <div class="alert alert-info">
                <div class="spinner-grow spinner-grow-sm me-2"></div>
                🧠 LLM analyse ta demande et décide des actions...
            </div>
        `;

        try {
            // Appeler le LLM Agent superintelligent
            const result = await this.apiCall('/api/llm/command', 'POST', { message: command });

            if (result.success) {
                // Afficher réponse LLM + résultats actions (utiliser result.results au lieu de result.actions.actions)
                const actionsHtml = result.results && result.results.length > 0 ? result.results.map(actionResult => {
                    const resultIcon = actionResult.result && actionResult.result.success ? '✅' : '❌';

                    let resultText = '';
                    if (actionResult.result && actionResult.result.success) {
                        if (actionResult.result.background) {
                            resultText = '🔄 En arrière-plan (5-10 min)';
                        } else if (actionResult.result.message) {
                            resultText = actionResult.result.message;
                        } else {
                            resultText = 'Réussi';
                        }
                    } else {
                        resultText = `Échoué: ${actionResult.result?.error || 'Erreur inconnue'}`;
                    }

                    return `
                        <div class="border-bottom pb-2 mb-2">
                            <div class="d-flex align-items-center gap-2">
                                <span>${resultIcon}</span>
                                <div class="flex-grow-1">
                                    <strong>${actionResult.action}</strong>
                                    <div class="small text-muted">${actionResult.reason || ''}</div>
                                </div>
                                <small class="${actionResult.result && actionResult.result.success ? 'text-success' : 'text-danger'}">${resultText}</small>
                            </div>
                        </div>
                    `;
                }).join('') : '';

                resultDiv.innerHTML = `
                    <div class="alert alert-success">
                        <h6><i class="bi bi-robot me-2"></i>Réponse LLM</h6>
                        <div class="mt-2 mb-3 p-3 rounded" style="background: rgba(255,255,255,0.1);">
                            ${result.actions?.analysis || result.llmResponse || 'Action en cours...'}
                        </div>
                        ${result.results && result.results.length > 0 ? `
                            <h6 class="mt-3"><i class="bi bi-list-check me-2"></i>Actions exécutées</h6>
                            <div class="mt-2">
                                ${actionsHtml}
                            </div>
                        ` : ''}
                        ${result.summary ? `
                            <div class="mt-3 small text-muted">
                                ${result.summary.replace(/\n/g, '<br>')}
                            </div>
                        ` : ''}
                    </div>
                `;
                commandInput.value = '';

                // Si des actions sont en arrière-plan, afficher la zone immédiatement
                const hasBackgroundActions = result.results?.some(r => r.result?.background);
                if (hasBackgroundActions) {
                    this.showBackgroundActivityPlaceholder();
                }

                // Sauvegarder dans l'historique
                this.saveLLMConversation(
                    command,
                    result.llmResponse || result.actions?.analysis || '',
                    result.results || [],
                    result.results || []
                );

                // Rafraîchir les données
                await this.loadStats();
                await this.updateSystemStatus();
            } else {
                resultDiv.innerHTML = `
                    <div class="alert alert-danger">
                        <i class="bi bi-exclamation-triangle me-2"></i>
                        Erreur: ${result.error || result.llmResponse || 'Commande échouée'}
                    </div>
                `;
            }
        } catch (error) {
            console.error('LLM command error:', error);
            resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    Erreur: ${error.message}
                </div>
            `;
        }
        // Pas de finally hideLoading() car on n'a pas fait showLoading()
    }

    // === CALENDAR TAB ===

    async loadCalendar() {
        try {
            // Charger le statut de sync
            const syncStatus = await this.apiCall('/api/calendar/sync/status');
            if (syncStatus.success) {
                const statusElement = document.getElementById('syncStatus');
                statusElement.innerHTML = `
                    <div class="d-flex align-items-center">
                        <span class="status-indicator status-connected"></span>
                        <span>Synchronisé</span>
                    </div>
                `;

                const lastSyncElement = document.getElementById('lastSync');
                const lastSync = new Date(syncStatus.stats.lastSyncTime).toLocaleString('fr-FR');
                lastSyncElement.innerHTML = `<small class="text-muted">Dernière sync: ${lastSync}</small>`;

                document.getElementById('activeMappings').textContent = syncStatus.mappings;
            }

            // Charger les événements prochains
            await this.loadUpcomingEvents();

        } catch (error) {
            console.error('Error loading calendar:', error);
        }
    }

    async loadUpcomingEvents() {
        const eventsContainer = document.getElementById('upcomingEvents');

        try {
            // Simuler des événements pour l'instant
            eventsContainer.innerHTML = `
                <div class="text-muted">
                    <p>Les événements synchronisés apparaîtront ici une fois la synchronisation active.</p>
                </div>
            `;
        } catch (error) {
            console.error('Error loading events:', error);
        }
    }

    async syncCalendar() {
        this.showLoading();
        try {
            await this.apiCall('/api/calendar/sync/full', 'POST');
            this.showAlert('Synchronisation terminée avec succès', 'success');
            await this.loadCalendar();
        } catch (error) {
            this.showAlert('Erreur lors de la synchronisation', 'danger');
        } finally {
            this.hideLoading();
        }
    }

    async refreshCalendar() {
        await this.loadCalendar();
    }

    // === SCHEDULER TAB ===

    async loadScheduler() {
        try {
            const status = await this.apiCall('/api/scheduler/status');

            if (status.success) {
                const schedulerStateEl = document.getElementById('schedulerState');
                const isRunning = status.status.isRunning || (status.status.scheduledJobs && status.status.scheduledJobs.length > 0);

                schedulerStateEl.textContent = isRunning ? '✓ Actif' : '✗ Inactif';
                schedulerStateEl.className = `badge ms-2 ${isRunning ? 'bg-success' : 'bg-danger'}`;

                document.getElementById('nextRun').textContent = status.status.nextRun ?
                    new Date(status.status.nextRun).toLocaleString('fr-FR') : '-';
                document.getElementById('lastRun').textContent = status.status.lastRun ?
                    new Date(status.status.lastRun).toLocaleString('fr-FR') : '-';
            }

            // Charger l'activité en temps réel
            await this.loadCurrentActivity();
            await this.loadSchedulerActivity();

            // Démarrer le polling pour l'activité en temps réel (toutes les 2 secondes)
            this.startActivityPolling();

        } catch (error) {
            console.error('Error loading scheduler:', error);
        }
    }

    startActivityPolling() {
        // Nettoyer l'intervalle précédent s'il existe
        if (this.activityPollingInterval) {
            clearInterval(this.activityPollingInterval);
        }

        // Poll toutes les 10 secondes quand on est sur l'onglet scheduler (réduit de 2s pour éviter rate limit 429)
        this.activityPollingInterval = setInterval(async () => {
            const activeTab = document.querySelector('.tab-pane.active');
            if (activeTab && activeTab.id === 'scheduler') {
                await this.loadCurrentActivity();
            }
        }, 10000); // 10 secondes
    }

    async loadCurrentActivity() {
        try {
            const response = await this.apiCall('/api/scheduler/activity');
            const activity = response.activity;

            const currentActivityEl = document.getElementById('currentActivity');
            const indicatorEl = document.getElementById('activityRefreshIndicator');

            if (activity.hasActiveActivity && activity.currentActivity) {
                const act = activity.currentActivity;
                const progress = act.progress || 0;
                const elapsedSeconds = Math.floor(act.elapsedTime / 1000);
                const estimatedRemaining = act.estimatedTimeRemaining ?
                    Math.floor(act.estimatedTimeRemaining / 1000) : null;

                // Mettre à jour l'indicateur
                indicatorEl.className = 'badge bg-success';
                indicatorEl.innerHTML = '<i class="bi bi-circle-fill" style="font-size: 8px; animation: pulse 1s infinite;"></i> En cours';

                // Afficher l'activité courante
                currentActivityEl.innerHTML = `
                    <div class="mb-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <div>
                                <strong>${act.description}</strong>
                                <div class="small text-muted">${act.type}</div>
                            </div>
                            <span class="badge bg-primary">${progress}%</span>
                        </div>
                        <div class="progress mb-2" style="height: 8px;">
                            <div class="progress-bar progress-bar-striped progress-bar-animated"
                                 role="progressbar"
                                 style="width: ${progress}%"
                                 aria-valuenow="${progress}"
                                 aria-valuemin="0"
                                 aria-valuemax="100"></div>
                        </div>
                        <div class="small text-muted">
                            <i class="bi bi-clock"></i> Écoulé: ${elapsedSeconds}s
                            ${estimatedRemaining ? `• Restant: ~${estimatedRemaining}s` : ''}
                        </div>
                    </div>

                    ${act.liveDetails ? `
                        <div class="border-top pt-3">
                            <div class="small mb-2"><strong>Détails en temps réel:</strong></div>

                            ${act.liveDetails.currentTask ? `
                                <div class="mb-3">
                                    <div class="d-flex align-items-center mb-2">
                                        ${act.liveDetails.status === 'processing' ? '<div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>' :
                                          act.liveDetails.status === 'success' ? '<i class="bi bi-check-circle text-success me-2"></i>' :
                                          act.liveDetails.status === 'error' ? '<i class="bi bi-x-circle text-danger me-2"></i>' :
                                          act.liveDetails.status === 'paused' ? '<i class="bi bi-pause-circle text-warning me-2"></i>' : ''}
                                        <span class="fw-bold">
                                            ${act.liveDetails.currentTaskIndex || '?'}/${act.liveDetails.totalTasks || '?'}
                                        </span>
                                    </div>
                                    <div class="small text-truncate" style="max-width: 100%;" title="${act.liveDetails.currentTask}">
                                        📋 ${act.liveDetails.currentTask}
                                    </div>
                                    ${act.liveDetails.targetDate ? `
                                        <div class="small text-muted mt-1">
                                            📅 Date cible: ${act.liveDetails.targetDate}
                                        </div>
                                    ` : ''}
                                </div>
                            ` : ''}

                            ${act.liveDetails.pauseReason ? `
                                <div class="alert alert-warning py-2 mb-2">
                                    <i class="bi bi-pause-circle"></i> ${act.liveDetails.pauseReason}
                                </div>
                            ` : ''}

                            ${act.liveDetails.lastError ? `
                                <div class="alert alert-danger py-2 mb-2 small">
                                    ❌ ${act.liveDetails.lastError}
                                </div>
                            ` : ''}

                            <div class="d-flex gap-3 small">
                                <span class="text-success">
                                    <i class="bi bi-check-circle-fill"></i> ${act.liveDetails.successCount || 0} réussies
                                </span>
                                ${act.liveDetails.errorCount > 0 ? `
                                    <span class="text-danger">
                                        <i class="bi bi-x-circle-fill"></i> ${act.liveDetails.errorCount} erreurs
                                    </span>
                                ` : ''}
                            </div>
                        </div>
                    ` : act.currentStep ? `
                        <div class="border-top pt-3">
                            <div class="small mb-2"><strong>Étape actuelle:</strong></div>
                            <div class="d-flex align-items-center">
                                <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                                <span>${act.currentStep}</span>
                            </div>
                        </div>
                    ` : ''}

                    ${act.steps && act.steps.length > 0 ? `
                        <div class="border-top pt-3 mt-3">
                            <div class="small mb-2"><strong>Étapes:</strong></div>
                            ${act.steps.map((step, idx) => `
                                <div class="d-flex align-items-start mb-1">
                                    ${step.status === 'completed' ? '<i class="bi bi-check-circle text-success me-2"></i>' :
                                      step.status === 'failed' ? '<i class="bi bi-x-circle text-danger me-2"></i>' :
                                      '<div class="spinner-border spinner-border-sm text-primary me-2" style="width: 14px; height: 14px;"></div>'}
                                    <span class="small ${step.status === 'completed' ? 'text-muted' : ''}">${idx + 1}. ${step.name}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                `;
            } else {
                // Aucune activité en cours
                indicatorEl.className = 'badge bg-secondary';
                indicatorEl.innerHTML = '<i class="bi bi-circle-fill" style="font-size: 8px;"></i> En veille';

                currentActivityEl.innerHTML = `
                    <div class="text-center text-muted py-3">
                        <i class="bi bi-hourglass-split"></i> Aucune activité en cours
                    </div>
                `;
            }

        } catch (error) {
            console.error('Error loading current activity:', error);
        }
    }

    async loadSchedulerActivity() {
        const activityContainer = document.getElementById('schedulerActivity');

        try {
            const response = await this.apiCall('/api/scheduler/activity/history?limit=10');

            if (!response.success || !response.history || response.history.length === 0) {
                activityContainer.innerHTML = `
                    <div class="text-center text-muted py-3">
                        Aucune activité récente
                    </div>
                `;
                return;
            }

            activityContainer.innerHTML = response.history.map(activity => {
                const date = new Date(activity.startTime);
                const dateStr = date.toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                const durationSeconds = Math.floor(activity.duration / 1000);
                const statusBadge = activity.status === 'success' ?
                    '<span class="badge bg-success">✓ Réussi</span>' :
                    '<span class="badge bg-danger">✗ Échoué</span>';

                return `
                    <div class="border-bottom pb-3 mb-3">
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="flex-grow-1">
                                <div class="mb-1">
                                    <strong>${activity.description}</strong>
                                    ${statusBadge}
                                </div>
                                <div class="small text-muted">
                                    <i class="bi bi-clock"></i> ${dateStr}
                                    • Durée: ${durationSeconds}s
                                    ${activity.steps ? `• ${activity.steps.length} étapes` : ''}
                                </div>
                                ${activity.result && Object.keys(activity.result).length > 0 ? `
                                    <div class="mt-2">
                                        ${activity.result.validated !== undefined ? `
                                            <div class="alert ${activity.result.validated ? 'alert-success' : 'alert-danger'} py-2 mb-2">
                                                <strong>${activity.result.validated ? '✅' : '❌'} Validation: ${activity.result.validated ? 'Chiffres RÉELS vérifiés' : 'ÉCART DÉTECTÉ'}</strong>
                                                <div class="small mt-2">
                                                    <strong>Annoncé:</strong>
                                                    ${activity.result.initialWithoutDate || '?'} sans date au départ →
                                                    ${activity.result.datesAssigned || 0} assignées →
                                                    ${(activity.result.initialWithoutDate || 0) - (activity.result.datesAssigned || 0)} restantes attendues
                                                </div>
                                                <div class="small mt-1">
                                                    <strong>Réalité TickTick:</strong>
                                                    ${activity.result.realFinalWithoutDate !== undefined ? `
                                                        <span class="badge ${activity.result.realFinalWithoutDate === 0 ? 'bg-success' : 'bg-warning'} ms-1">
                                                            ${activity.result.realFinalWithoutDate} sans date
                                                        </span>
                                                    ` : ''}
                                                    ${activity.result.realFinalWithDate !== undefined ? `
                                                        <span class="badge bg-info ms-1">
                                                            ${activity.result.realFinalWithDate} avec date
                                                        </span>
                                                    ` : ''}
                                                    ${activity.result.realFinalOverloaded !== undefined ? `
                                                        <span class="badge ${activity.result.realFinalOverloaded === 0 ? 'bg-success' : 'bg-warning'} ms-1">
                                                            ${activity.result.realFinalOverloaded} jours surchargés
                                                        </span>
                                                    ` : ''}
                                                </div>
                                            </div>
                                        ` : ''}
                                        ${Object.entries(activity.result).filter(([key]) => !['validated', 'realFinalWithoutDate', 'realFinalWithDate', 'realFinalOverloaded', 'initialWithoutDate', 'datesAssigned'].includes(key)).map(([key, value]) => `
                                            <span class="badge bg-info me-1">
                                                ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}
                                            </span>
                                        `).join('')}
                                    </div>
                                ` : ''}
                                ${activity.errors && activity.errors.length > 0 ? `
                                    <div class="mt-2">
                                        <div class="alert alert-warning py-2 mb-0">
                                            <strong><i class="bi bi-exclamation-triangle"></i> ${activity.errors.length} erreur(s)</strong>
                                            <div class="small mt-2" style="max-height: 200px; overflow-y: auto;">
                                                ${activity.errors.map((err, idx) => `
                                                    <div class="mb-2 ${idx > 0 ? 'border-top pt-2' : ''}">
                                                        <strong>${err.context}</strong>: ${err.message}
                                                        ${err.httpStatus ? `<span class="badge bg-danger ms-1">HTTP ${err.httpStatus}</span>` : ''}
                                                        ${err.details && Object.keys(err.details).length > 0 ? `
                                                            <div class="text-muted small mt-1">
                                                                ${Object.entries(err.details).map(([k, v]) =>
                                                                    `${k}: ${typeof v === 'object' ? JSON.stringify(v).substring(0, 50) : String(v).substring(0, 50)}`
                                                                ).join(' • ')}
                                                            </div>
                                                        ` : ''}
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error('Error loading scheduler activity:', error);
            activityContainer.innerHTML = `
                <div class="alert alert-danger">
                    Erreur lors du chargement de l'historique
                </div>
            `;
        }
    }

    async startScheduler() {
        this.showLoading();
        try {
            await this.apiCall('/api/scheduler/start', 'POST');
            this.showAlert('Scheduler démarré avec succès', 'success');
            await this.loadScheduler();
        } catch (error) {
            this.showAlert('Erreur lors du démarrage du scheduler', 'danger');
        } finally {
            this.hideLoading();
        }
    }

    async stopScheduler() {
        this.showLoading();
        try {
            await this.apiCall('/api/scheduler/stop', 'POST');
            this.showAlert('Scheduler arrêté avec succès', 'warning');
            await this.loadScheduler();
        } catch (error) {
            this.showAlert('Erreur lors de l\'arrêt du scheduler', 'danger');
        } finally {
            this.hideLoading();
        }
    }

    async runScheduler() {
        this.showLoading();
        try {
            await this.apiCall('/api/scheduler/run', 'POST');
            this.showAlert('Organisation quotidienne lancée', 'info');
            await this.loadScheduler();
        } catch (error) {
            this.showAlert('Erreur lors de l\'exécution', 'danger');
        } finally {
            this.hideLoading();
        }
    }

    async analyzeAirtable() {
        this.showLoading();
        try {
            await this.apiCall('/api/scheduler/analyze-airtable', 'POST');
            this.showAlert('🧠 Planification intelligente lancée (Reclaim.ai) - Next Best Time activé', 'success');
            await this.loadScheduler();

            setTimeout(() => {
                this.loadCurrentActivity();
                this.loadSchedulerActivity();
            }, 5000);
        } catch (error) {
            this.showAlert('Erreur lors de la planification intelligente', 'danger');
        } finally {
            this.hideLoading();
        }
    }

    async continuousAdjust() {
        this.showLoading();
        try {
            // 🔄 Lancer l'ajustement continu (rééquilibrage 60 jours)
            await this.apiCall('/api/scheduler/continuous-adjust', 'POST');

            // 🗂️ Lancer le nettoyage Inbox (classification intelligente LLM)
            await this.apiCall('/api/scheduler/inbox-cleanup', 'POST');

            this.showAlert('🔄 Ajustement Auto Complet lancé:\n• Rééquilibrage 60 jours (2-3 tâches/jour)\n• Nettoyage Inbox avec LLM\n• Planification intelligente\n\nVisible en temps réel ci-dessous', 'success');

            // Charger immédiatement l'activité
            this.loadCurrentActivity();
            this.loadSchedulerActivity();

            // Continuer à rafraîchir toutes les 3 secondes pendant 60 secondes (Inbox peut prendre plus de temps)
            let refreshCount = 0;
            const refreshInterval = setInterval(() => {
                this.loadCurrentActivity();
                this.loadSchedulerActivity();
                refreshCount++;

                if (refreshCount >= 20) { // 60 secondes (20 * 3s)
                    clearInterval(refreshInterval);
                }
            }, 3000);
        } catch (error) {
            this.showAlert('Erreur lors de l\'ajustement automatique', 'danger');
        } finally {
            this.hideLoading();
        }
    }

    async cleanCalendar() {
        const confirmed = confirm('⚠️ ATTENTION: Supprimer TOUTES les tâches auto-générées du Calendar?\n\nCela supprimera tous les événements contenant:\n- "auto-generated"\n- "cap-numerique"\n- "TickTick:"\n- "Generated with Claude Code"\n\nCette action est IRRÉVERSIBLE.');

        if (!confirmed) return;

        this.showLoading();
        try {
            const result = await this.apiCall('/api/scheduler/clean-calendar', 'POST');

            this.showAlert(`🧹 ${result.eventsDeleted} événements supprimés du Calendar`, 'success');

            console.log('Calendar nettoyé:', result);
        } catch (error) {
            this.showAlert('Erreur lors du nettoyage Calendar', 'danger');
        } finally {
            this.hideLoading();
        }
    }

    async cleanTimes() {
        const confirmed = confirm('🕒 Nettoyer TOUS les horaires des tâches?\n\nCela va:\n- Retirer les heures de TOUTES les tâches TickTick\n- Convertir en tâches "toute la journée" (all-day)\n- Garder uniquement la date (sans heure)\n\nExemple: "2025-10-15 14:30" → "2025-10-15 (toute la journée)"\n\nContinuer?');

        if (!confirmed) return;

        this.showLoading('🧹 Démarrage nettoyage...');
        try {
            const result = await this.apiCall('/api/scheduler/clean-times', 'POST');

            this.hideLoading();

            this.showAlert('🧹 Nettoyage des horaires lancé - Voir "Activité en Temps Réel" pour le suivi', 'info');

            console.log('Nettoyage horaires lancé:', result);

            // Rafraîchir automatiquement pour voir l'activité
            setTimeout(() => this.refreshScheduler(), 1000);
        } catch (error) {
            this.hideLoading();
            this.showAlert('Erreur lors du lancement du nettoyage: ' + (error.message || 'Erreur inconnue'), 'danger');
            console.error('Erreur cleanTimes:', error);
        }
    }

    async cancelCurrentActivity() {
        const confirmed = confirm('🛑 Arrêter l\'activité en cours?\n\nCela va:\n- Annuler immédiatement le processus en cours\n- Arrêter le nettoyage, l\'ajustement ou toute autre opération\n\nContinuer?');

        if (!confirmed) return;

        this.showLoading('🛑 Annulation...');
        try {
            const result = await this.apiCall('/api/scheduler/cancel-activity', 'POST');

            this.hideLoading();

            if (result.success) {
                this.showAlert('🛑 Activité annulée avec succès', 'warning');
            } else {
                this.showAlert('Aucune activité en cours à annuler', 'info');
            }

            console.log('Annulation:', result);

            // Rafraîchir pour voir le changement
            setTimeout(() => this.refreshScheduler(), 500);
        } catch (error) {
            this.hideLoading();
            this.showAlert('Erreur lors de l\'annulation: ' + (error.message || 'Erreur inconnue'), 'danger');
            console.error('Erreur cancelCurrentActivity:', error);
        }
    }

    async generateReport() {
        this.showLoading();
        try {
            const report = await this.apiCall('/api/scheduler/report/daily');

            if (report.success) {
                // Afficher le rapport dans une modal ou section dédiée
                this.showAlert('Rapport généré avec succès', 'success');
                console.log('Daily report:', report.report);
            }
        } catch (error) {
            this.showAlert('Erreur lors de la génération du rapport', 'danger');
        } finally {
            this.hideLoading();
        }
    }

    async refreshScheduler() {
        await this.loadScheduler();
    }

    // === TAB MANAGEMENT ===

    async handleTabSwitch(tabName) {
        if (!this.isAuthenticated) return;

        switch (tabName) {
            case 'dashboard':
                await this.loadDashboard();
                break;
            case 'calendar':
                await this.loadCalendar();
                break;
            case 'scheduler':
                await this.loadScheduler();
                break;
            case 'backup':
                await this.loadBackup();
                break;
        }
    }

    async refreshCurrentTab() {
        const activeTab = document.querySelector('.tab-pane.active');
        if (activeTab) {
            await this.handleTabSwitch(activeTab.id);
        }
    }

    // === UTILITIES ===

    showAlert(message, type = 'info') {
        // Créer container de toasts si n'existe pas
        let toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toastContainer';
            toastContainer.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-width: 350px;
            `;
            document.body.appendChild(toastContainer);
        }

        // Mapping types Bootstrap vers couleurs mode sombre
        const colors = {
            'success': { bg: '#1a4d2e', border: '#28a745', icon: '✓' },
            'danger': { bg: '#4d1a1a', border: '#dc3545', icon: '✕' },
            'warning': { bg: '#4d3d1a', border: '#ffc107', icon: '⚠' },
            'info': { bg: '#1a2d4d', border: '#17a2b8', icon: 'ℹ' }
        };

        const color = colors[type] || colors['info'];

        // Créer toast compact
        const toast = document.createElement('div');
        toast.style.cssText = `
            background: ${color.bg};
            border-left: 4px solid ${color.border};
            color: #fff;
            padding: 12px 16px;
            border-radius: 6px;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideIn 0.3s ease-out;
            max-width: 350px;
        `;

        toast.innerHTML = `
            <span style="font-size: 16px; font-weight: bold;">${color.icon}</span>
            <span style="flex: 1;">${message}</span>
            <button onclick="this.parentElement.remove()" style="
                background: none;
                border: none;
                color: #fff;
                cursor: pointer;
                opacity: 0.7;
                font-size: 18px;
                padding: 0;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            ">×</button>
        `;

        // Ajouter animation CSS
        if (!document.getElementById('toastAnimations')) {
            const style = document.createElement('style');
            style.id = 'toastAnimations';
            style.textContent = `
                @keyframes slideIn {
                    from {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes slideOut {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        toastContainer.appendChild(toast);

        // Auto-remove après 5 secondes avec animation
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }, 5000);
    }

    showLoading() {
        document.getElementById('loadingOverlay').classList.remove('d-none');
    }

    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('d-none');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // === BACKUP TAB ===

    async loadBackup() {
        console.log('Loading backup tab...');
        await Promise.all([
            this.loadChaosLevel(),
            this.loadBackupHistory(),
            this.loadSnapshots()
        ]);
        this.setupBackupHandlers();
    }

    async loadChaosLevel() {
        try {
            const response = await this.apiCall('/api/backup/chaos-check');
            const chaos = response.chaos;

            document.getElementById('chaosLevel').textContent = `${chaos.level}/100`;
            document.getElementById('chaosEventsTotal').textContent = chaos.issues.totalEvents;
            document.getElementById('chaosEventsMidnight').textContent = chaos.issues.eventsAtMidnight;
            document.getElementById('chaosOverlapping').textContent = chaos.issues.overlappingEvents;

            const chaosCard = document.getElementById('chaosCard');
            const recommendation = document.getElementById('chaosRecommendation');

            if (chaos.detected) {
                chaosCard.classList.add('border-danger');
                chaosCard.classList.remove('border-success');
                recommendation.className = 'alert alert-danger mb-3';
                recommendation.innerHTML = `<i class="bi bi-exclamation-triangle"></i> ${chaos.recommendation}`;
            } else {
                chaosCard.classList.add('border-success');
                chaosCard.classList.remove('border-danger');
                recommendation.className = 'alert alert-success mb-3';
                recommendation.innerHTML = `<i class="bi bi-check-circle"></i> ${chaos.recommendation}`;
            }

        } catch (error) {
            console.error('Erreur chargement chaos:', error);
        }
    }

    async loadBackupHistory() {
        try {
            const response = await this.apiCall('/api/backup/history?limit=10');
            const history = response.history;

            const historyContainer = document.getElementById('backupHistory');

            if (!history || history.length === 0) {
                historyContainer.innerHTML = '<div class="text-center text-muted py-3">Aucun historique disponible</div>';
                return;
            }

            const actionIcons = {
                'snapshot_created': '<i class="bi bi-camera text-success"></i>',
                'snapshot_restored': '<i class="bi bi-arrow-counterclockwise text-warning"></i>',
                'snapshot_deleted': '<i class="bi bi-trash text-danger"></i>'
            };

            const actionLabels = {
                'snapshot_created': 'Snapshot créé',
                'snapshot_restored': 'Snapshot restauré',
                'snapshot_deleted': 'Snapshot supprimé'
            };

            historyContainer.innerHTML = history.map(entry => {
                const date = new Date(entry.timestamp);
                const dateStr = date.toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                const counters = entry.counters;
                const hasCounters = counters.calendarCreated > 0 || counters.calendarDeleted > 0 ||
                                   counters.ticktickCreated > 0 || counters.ticktickDeleted > 0;

                return `
                    <div class="border-bottom pb-3 mb-3">
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="flex-grow-1">
                                <div class="mb-1">
                                    ${actionIcons[entry.action] || '<i class="bi bi-info-circle"></i>'}
                                    <strong>${actionLabels[entry.action] || entry.action}</strong>
                                    <span class="text-muted small ms-2">${dateStr}</span>
                                </div>
                                ${entry.details.reason ? `<div class="small text-muted mb-2"><i class="bi bi-tag"></i> ${entry.details.reason}</div>` : ''}
                                ${hasCounters ? `
                                    <div class="row g-2 mt-2">
                                        ${counters.calendarCreated > 0 ? `
                                            <div class="col-auto">
                                                <span class="badge bg-success">
                                                    <i class="bi bi-calendar-plus"></i> ${counters.calendarCreated} créé${counters.calendarCreated > 1 ? 's' : ''}
                                                </span>
                                            </div>
                                        ` : ''}
                                        ${counters.calendarDeleted > 0 ? `
                                            <div class="col-auto">
                                                <span class="badge bg-danger">
                                                    <i class="bi bi-calendar-x"></i> ${counters.calendarDeleted} supprimé${counters.calendarDeleted > 1 ? 's' : ''}
                                                </span>
                                            </div>
                                        ` : ''}
                                        ${counters.ticktickCreated > 0 ? `
                                            <div class="col-auto">
                                                <span class="badge bg-success">
                                                    <i class="bi bi-check2-circle"></i> ${counters.ticktickCreated} tâche${counters.ticktickCreated > 1 ? 's' : ''} créée${counters.ticktickCreated > 1 ? 's' : ''}
                                                </span>
                                            </div>
                                        ` : ''}
                                        ${counters.ticktickDeleted > 0 ? `
                                            <div class="col-auto">
                                                <span class="badge bg-danger">
                                                    <i class="bi bi-x-circle"></i> ${counters.ticktickDeleted} tâche${counters.ticktickDeleted > 1 ? 's' : ''} supprimée${counters.ticktickDeleted > 1 ? 's' : ''}
                                                </span>
                                            </div>
                                        ` : ''}
                                        ${counters.totalEvents > 0 ? `
                                            <div class="col-auto">
                                                <span class="badge bg-info">
                                                    <i class="bi bi-calendar-event"></i> ${counters.totalEvents} événement${counters.totalEvents > 1 ? 's' : ''}
                                                </span>
                                            </div>
                                        ` : ''}
                                        ${counters.totalTasks > 0 ? `
                                            <div class="col-auto">
                                                <span class="badge bg-info">
                                                    <i class="bi bi-list-task"></i> ${counters.totalTasks} tâche${counters.totalTasks > 1 ? 's' : ''}
                                                </span>
                                            </div>
                                        ` : ''}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error('Erreur chargement historique:', error);
            document.getElementById('backupHistory').innerHTML = '<div class="alert alert-danger">Erreur lors du chargement de l\'historique</div>';
        }
    }

    async loadSnapshots() {
        try {
            const response = await this.apiCall('/api/backup/list');
            const snapshots = response.snapshots;

            const snapshotList = document.getElementById('snapshotList');

            if (!snapshots || snapshots.length === 0) {
                snapshotList.innerHTML = '<div class="text-center text-muted py-3">Aucun snapshot disponible</div>';
                return;
            }

            snapshotList.innerHTML = snapshots.map(snapshot => {
                const date = new Date(snapshot.timestamp);
                const dateStr = date.toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                return `
                    <div class="border-bottom pb-3 mb-3">
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="flex-grow-1">
                                <div class="mb-1">
                                    <strong><i class="bi bi-archive"></i> ${snapshot.id}</strong>
                                    <span class="text-muted small ms-2">${dateStr}</span>
                                </div>
                                <div class="small text-muted mb-2">
                                    <i class="bi bi-tag"></i> ${snapshot.reason}
                                </div>
                                <div class="row g-2">
                                    <div class="col-auto">
                                        <span class="badge bg-primary">
                                            <i class="bi bi-calendar-event"></i> ${snapshot.calendarEventsCount} événements
                                        </span>
                                    </div>
                                    <div class="col-auto">
                                        <span class="badge bg-primary">
                                            <i class="bi bi-list-task"></i> ${snapshot.ticktickTasksCount} tâches
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div class="d-flex gap-2">
                                <button class="btn btn-sm btn-warning" onclick="app.restoreSnapshot('${snapshot.id}')">
                                    <i class="bi bi-arrow-counterclockwise"></i> Restaurer
                                </button>
                                <button class="btn btn-sm btn-danger" onclick="app.deleteSnapshot('${snapshot.id}')">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error('Erreur chargement snapshots:', error);
            document.getElementById('snapshotList').innerHTML = '<div class="alert alert-danger">Erreur lors du chargement des snapshots</div>';
        }
    }

    setupBackupHandlers() {
        const createBtn = document.getElementById('createSnapshotBtn');
        if (createBtn && !createBtn.dataset.listenerAdded) {
            createBtn.addEventListener('click', async () => {
                await this.createSnapshot();
            });
            createBtn.dataset.listenerAdded = 'true';
        }
    }

    async createSnapshot() {
        const reasonInput = document.getElementById('snapshotReason');
        const reason = reasonInput.value.trim() || 'manual';
        const btn = document.getElementById('createSnapshotBtn');

        btn.disabled = true;
        btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Création...';

        try {
            const response = await this.apiCall('/api/backup/snapshot', 'POST', { reason });

            if (response.success) {
                this.showAlert(`✅ Snapshot créé: ${response.snapshot.calendarEvents} événements, ${response.snapshot.ticktickTasks} tâches`, 'success');
                reasonInput.value = '';
                await this.loadSnapshots();
                await this.loadBackupHistory();
            } else {
                this.showAlert(`❌ Erreur: ${response.error}`, 'danger');
            }
        } catch (error) {
            this.showAlert(`❌ Erreur: ${error.message}`, 'danger');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-camera"></i> Créer Snapshot';
        }
    }

    async restoreSnapshot(snapshotId) {
        if (!confirm(`⚠️ Confirmer la restauration depuis ${snapshotId}?\n\nCela va:\n- Créer un snapshot de sécurité\n- Supprimer les événements/tâches non présents dans le snapshot\n- Recréer les événements/tâches du snapshot`)) {
            return;
        }

        this.showAlert('🔄 Restauration en cours...', 'warning');
        this.showLoading();

        try {
            const response = await this.apiCall(`/api/backup/restore/${snapshotId}`, 'POST');

            if (response.success) {
                const cal = response.restored.calendar;
                const tick = response.restored.ticktick;
                this.showAlert(`✅ Restauration réussie!\n\nCalendar: ${cal.created} créés, ${cal.deleted} supprimés\nTickTick: ${tick.created} créés, ${tick.deleted} supprimés\n\nSnapshot sécurité: ${response.preRestoreSnapshot}`, 'success');
                await this.loadSnapshots();
                await this.loadBackupHistory();
                await this.loadChaosLevel();
            } else {
                this.showAlert(`❌ Erreur: ${response.error}`, 'danger');
            }
        } catch (error) {
            this.showAlert(`❌ Erreur: ${error.message}`, 'danger');
        } finally {
            this.hideLoading();
        }
    }

    async deleteSnapshot(snapshotId) {
        if (!confirm(`Supprimer le snapshot ${snapshotId}?`)) {
            return;
        }

        try {
            const response = await this.apiCall(`/api/backup/${snapshotId}`, 'DELETE');

            if (response.success) {
                this.showAlert('✅ Snapshot supprimé', 'success');
                await this.loadSnapshots();
                await this.loadBackupHistory();
            } else {
                this.showAlert(`❌ Erreur: ${response.error}`, 'danger');
            }
        } catch (error) {
            this.showAlert(`❌ Erreur: ${error.message}`, 'danger');
        }
    }

    // === MODALS ===

    async showAuthModal() {
        // Charger les statuts des connexions
        try {
            const [ticktickStatus, googleStatus] = await Promise.all([
                this.apiCall('/auth/ticktick/status'),
                this.apiCall('/auth/google/status')
            ]);

            // Créer le contenu de la modal
            const modalContent = `
                <div class="modal fade" id="authModal" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content bg-dark">
                            <div class="modal-header border-secondary">
                                <h5 class="modal-title">
                                    <i class="bi bi-key"></i> Gestion Authentification
                                </h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="row">
                                    <div class="col-md-6">
                                        <div class="card mb-3">
                                            <div class="card-header">
                                                <h6 class="mb-0"><i class="bi bi-check-circle"></i> TickTick</h6>
                                            </div>
                                            <div class="card-body">
                                                <div class="d-flex align-items-center mb-3">
                                                    <span class="status-indicator ${ticktickStatus.connected ? 'status-connected' : 'status-disconnected'}"></span>
                                                    <span>${ticktickStatus.connected ? 'Connecté' : 'Déconnecté'}</span>
                                                </div>
                                                ${ticktickStatus.connected ?
                                                    '<button class="btn btn-warning btn-sm" onclick="window.app.disconnectTickTick()">Déconnecter</button>' :
                                                    '<button class="btn btn-primary btn-sm" onclick="window.app.connectTickTick()">Se connecter</button>'
                                                }
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="card mb-3">
                                            <div class="card-header">
                                                <h6 class="mb-0"><i class="bi bi-calendar3"></i> Google Calendar</h6>
                                            </div>
                                            <div class="card-body">
                                                <div class="d-flex align-items-center mb-3">
                                                    <span class="status-indicator ${googleStatus.connected ? 'status-connected' : 'status-disconnected'}"></span>
                                                    <span>${googleStatus.connected ? 'Connecté' : 'Déconnecté'}</span>
                                                </div>
                                                ${googleStatus.connected ?
                                                    '<button class="btn btn-warning btn-sm" onclick="window.app.disconnectGoogle()">Déconnecter</button>' :
                                                    '<button class="btn btn-primary btn-sm" onclick="window.app.connectGoogle()">Se connecter</button>'
                                                }
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="alert alert-info">
                                    <i class="bi bi-info-circle"></i>
                                    <strong>Info :</strong> Les connexions OAuth2 permettent à l'orchestrateur d'accéder à vos données TickTick et Google Calendar de manière sécurisée.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Supprimer modal existante
            const existingModal = document.getElementById('authModal');
            if (existingModal) existingModal.remove();

            // Ajouter la nouvelle modal
            document.body.insertAdjacentHTML('beforeend', modalContent);

            // Afficher la modal
            const modal = new bootstrap.Modal(document.getElementById('authModal'));
            modal.show();

        } catch (error) {
            console.error('Erreur chargement authentification:', error);
            this.showAlert('Erreur lors du chargement des informations d\'authentification', 'danger');
        }
    }

    async connectTickTick() {
        try {
            // Redirection vers l'autorisation TickTick via la route de config
            window.open('/api/config/auth/ticktick', '_blank');
            this.showAlert('Fenêtre d\'autorisation TickTick ouverte', 'info');
        } catch (error) {
            this.showAlert('Erreur lors de la connexion TickTick', 'danger');
        }
    }

    async disconnectTickTick() {
        try {
            await this.apiCall('/auth/ticktick/disconnect', 'POST');
            this.showAlert('TickTick déconnecté avec succès', 'warning');
            // Recharger la modal
            this.showAuthModal();
        } catch (error) {
            this.showAlert('Erreur lors de la déconnexion TickTick', 'danger');
        }
    }

    async connectGoogle() {
        try {
            // Redirection vers l'autorisation Google via la route de config
            window.open('/api/config/auth/google', '_blank');
            this.showAlert('Fenêtre d\'autorisation Google Calendar ouverte', 'info');
        } catch (error) {
            this.showAlert('Erreur lors de la connexion Google Calendar', 'danger');
        }
    }

    async disconnectGoogle() {
        try {
            await this.apiCall('/auth/google/disconnect', 'POST');
            this.showAlert('Google Calendar déconnecté avec succès', 'warning');
            // Recharger la modal
            this.showAuthModal();
        } catch (error) {
            this.showAlert('Erreur lors de la déconnexion Google Calendar', 'danger');
        }
    }

    async showConfigModal() {
        // Charger la configuration actuelle
        try {
            const currentConfig = await this.apiCall('/api/config/current');

            const modalContent = `
                <div class="modal fade" id="configModal" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content bg-dark">
                            <div class="modal-header border-secondary">
                                <h5 class="modal-title">
                                    <i class="bi bi-sliders"></i> Paramètres Avancés
                                </h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <form id="configForm">
                                    <div class="row">
                                        <div class="col-md-6">
                                            <h6><i class="bi bi-clock"></i> Planificateur</h6>
                                            <div class="mb-3">
                                                <label class="form-label">Heure quotidienne (6h par défaut)</label>
                                                <input type="time" class="form-control" id="dailyTime" value="${currentConfig.config.scheduler.dailyTime}">
                                            </div>
                                            <div class="mb-3">
                                                <label class="form-label">Intervalle sync (minutes)</label>
                                                <input type="number" class="form-control" id="syncInterval" value="${currentConfig.config.scheduler.syncInterval}" min="5" max="120">
                                            </div>
                                            <div class="mb-3">
                                                <label class="form-label">Max tâches/jour</label>
                                                <input type="number" class="form-control" id="maxTasks" value="${currentConfig.config.scheduler.maxDailyTasks}" min="1" max="10">
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <h6><i class="bi bi-calendar3"></i> Calendriers</h6>
                                            <div class="mb-3">
                                                <label class="form-label">Calendrier Jeremy</label>
                                                <input type="email" class="form-control" id="jeremyCalendar" value="${currentConfig.config.calendar.jeremyCalendarId}">
                                            </div>
                                            <div class="mb-3">
                                                <label class="form-label">Calendrier Business</label>
                                                <input type="email" class="form-control" id="businessCalendar" value="${currentConfig.config.calendar.businessCalendarId}">
                                            </div>
                                            <h6><i class="bi bi-shield"></i> Sécurité</h6>
                                            <div class="mb-3">
                                                <label class="form-label">Nouveau mot de passe admin</label>
                                                <input type="password" class="form-control" id="newPassword" placeholder="Laisser vide pour ne pas changer">
                                            </div>
                                        </div>
                                    </div>
                                    <div class="alert alert-info">
                                        <i class="bi bi-info-circle"></i>
                                        <strong>Info :</strong> Ces paramètres affectent le comportement global de l'orchestrateur. Un redémarrage peut être nécessaire.
                                    </div>
                                    <div class="d-flex justify-content-end">
                                        <button type="button" class="btn btn-secondary me-2" data-bs-dismiss="modal">Annuler</button>
                                        <button type="submit" class="btn btn-primary">Sauvegarder</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Supprimer modal existante
            const existingModal = document.getElementById('configModal');
            if (existingModal) existingModal.remove();

            // Ajouter la nouvelle modal
            document.body.insertAdjacentHTML('beforeend', modalContent);

            // Setup form handler
            document.getElementById('configForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveAdvancedConfig();
            });

            // Afficher la modal
            const modal = new bootstrap.Modal(document.getElementById('configModal'));
            modal.show();

        } catch (error) {
            console.error('Erreur chargement configuration:', error);
            this.showAlert('Erreur lors du chargement des paramètres', 'danger');
        }
    }

    async saveAdvancedConfig() {
        try {
            const formData = {
                dailyTime: document.getElementById('dailyTime').value,
                syncInterval: parseInt(document.getElementById('syncInterval').value),
                maxDailyTasks: parseInt(document.getElementById('maxTasks').value),
                jeremyCalendarId: document.getElementById('jeremyCalendar').value,
                businessCalendarId: document.getElementById('businessCalendar').value
            };

            const newPassword = document.getElementById('newPassword').value;
            if (newPassword) {
                formData.adminPassword = newPassword;
            }

            const result = await this.apiCall('/api/config/save', 'POST', formData);

            // Message selon le type de changement
            if (result.schedulerRestarted) {
                this.showAlert('✅ Paramètres du scheduler sauvegardés et appliqués immédiatement', 'success');
            } else if (result.willRestart) {
                this.showAlert('⚡ Configuration sauvegardée. Redémarrage serveur en cours...', 'warning');
            } else {
                this.showAlert('✅ Configuration sauvegardée avec succès', 'success');
            }

            // Fermer la modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('configModal'));
            modal.hide();

            // Rafraîchir le statut si le scheduler a été modifié
            if (result.schedulerRestarted) {
                setTimeout(() => {
                    this.refreshScheduler();
                }, 1000);
            }

        } catch (error) {
            console.error('Erreur sauvegarde config:', error);
            this.showAlert('Erreur lors de la sauvegarde des paramètres', 'danger');
        }
    }

    // ============================================
    // HISTORIQUE LLM
    // ============================================

    saveLLMConversation(userCommand, llmResponse, actions, results) {
        const history = JSON.parse(localStorage.getItem('llmHistory') || '[]');

        history.push({
            timestamp: new Date().toISOString(),
            userCommand,
            llmResponse,
            actions: actions.length,
            success: results.filter(r => r.result?.success).length,
            failed: results.filter(r => !r.result?.success).length
        });

        // Garder seulement les 50 dernières conversations
        if (history.length > 50) {
            history.shift();
        }

        localStorage.setItem('llmHistory', JSON.stringify(history));
        this.displayLLMHistory();
    }

    displayLLMHistory() {
        const history = JSON.parse(localStorage.getItem('llmHistory') || '[]');
        const llmHistoryDiv = document.getElementById('llmHistory');
        const llmHistoryList = document.getElementById('llmHistoryList');

        if (!llmHistoryList) return;

        if (history.length === 0) {
            llmHistoryDiv.style.display = 'none';
            return;
        }

        llmHistoryDiv.style.display = 'block';

        const reversedHistory = [...history].reverse(); // Plus récent en premier
        llmHistoryList.innerHTML = reversedHistory.map((conv, idx) => {
            const time = new Date(conv.timestamp).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit'
            });

            return `
                <div class="mb-2 p-2 border-bottom">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <strong class="text-primary">👤 Vous (${time}):</strong>
                            <div class="ms-3 mb-1">${conv.userCommand}</div>
                            <strong class="text-success">🤖 LLM:</strong>
                            <div class="ms-3 small text-muted">
                                ${conv.actions} action(s) :
                                <span class="text-success">${conv.success} ✅</span>
                                ${conv.failed > 0 ? `<span class="text-danger">${conv.failed} ❌</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    clearLLMHistory() {
        if (confirm('Voulez-vous vraiment effacer l\'historique des conversations ?')) {
            localStorage.removeItem('llmHistory');
            document.getElementById('llmHistory').style.display = 'none';
        }
    }
}

// Global functions pour les event handlers HTML
window.executeCommand = () => app.executeCommand();
window.syncCalendar = () => app.syncCalendar();
window.refreshCalendar = () => app.refreshCalendar();
window.startScheduler = () => app.startScheduler();
window.stopScheduler = () => app.stopScheduler();
window.runScheduler = () => app.runScheduler();
window.analyzeAirtable = () => app.analyzeAirtable();
window.continuousAdjust = () => app.continuousAdjust();
window.cleanCalendar = () => app.cleanCalendar();
window.cleanTimes = () => app.cleanTimes();
window.cancelCurrentActivity = () => app.cancelCurrentActivity();
window.generateReport = () => app.generateReport();
window.refreshScheduler = () => app.refreshScheduler();
window.showAuthModal = () => app.showAuthModal();
window.showConfigModal = () => app.showConfigModal();
window.logout = () => app.logout();
window.goToConfig = () => app.goToConfig();
window.goHome = () => app.goHome();

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Erreur JavaScript globale:', event.error);
    console.error('Message:', event.message);
    console.error('Fichier:', event.filename);
    console.error('Ligne:', event.lineno);
});

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initialisation de l\'app...');
    try {
        window.app = new OrchestratorApp();
        console.log('App initialisée avec succès');
    } catch (error) {
        console.error('Erreur lors de l\'initialisation de l\'app:', error);
    }
});
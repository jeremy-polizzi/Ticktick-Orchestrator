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

            // Charger les statistiques
            await this.loadStats();

        } catch (error) {
            console.error('Error loading dashboard:', error);
            this.showAlert('Erreur lors du chargement du dashboard', 'danger');
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

        this.showLoading();
        resultDiv.innerHTML = `
            <div class="alert alert-info">
                <div class="spinner-grow spinner-grow-sm me-2"></div>
                Exécution de la commande...
            </div>
        `;

        try {
            const result = await this.apiCall('/api/tasks/command', 'POST', { command });

            if (result.success) {
                // Si c'est une action de liste, afficher les tâches
                if (result.action === 'list' && result.tasks) {
                    const tasksList = result.tasks.map(task => {
                        const dueDate = task.dueDate ? new Date(task.dueDate).toLocaleDateString('fr-FR') : 'Pas de date';
                        const priority = task.priority || 0;
                        const priorityBadge = priority > 0 ? `<span class="badge bg-danger">P${priority}</span>` : '';

                        return `
                            <div class="border-bottom pb-2 mb-2">
                                <div class="d-flex justify-content-between align-items-start">
                                    <div>
                                        <strong>${task.title}</strong>
                                        ${priorityBadge}
                                    </div>
                                    <small class="text-muted">${dueDate}</small>
                                </div>
                                ${task.tags && task.tags.length > 0 ? `
                                    <div class="mt-1">
                                        ${task.tags.map(tag => `<span class="badge bg-secondary">#${tag}</span>`).join(' ')}
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    }).join('');

                    resultDiv.innerHTML = `
                        <div class="alert alert-success">
                            <h6><i class="bi bi-list-check me-2"></i>${result.message}</h6>
                            <div class="mt-3" style="max-height: 400px; overflow-y: auto;">
                                ${tasksList}
                            </div>
                        </div>
                    `;
                } else {
                    resultDiv.innerHTML = `
                        <div class="alert alert-success">
                            <i class="bi bi-check-circle me-2"></i>
                            Commande exécutée avec succès
                        </div>
                    `;
                }
                commandInput.value = '';

                // Rafraîchir les données
                await this.loadStats();
            } else {
                resultDiv.innerHTML = `
                    <div class="alert alert-danger">
                        <i class="bi bi-exclamation-triangle me-2"></i>
                        Erreur: ${result.error || 'Commande échouée'}
                    </div>
                `;
            }
        } catch (error) {
            console.error('Command execution error:', error);
            resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    Erreur: ${error.message}
                </div>
            `;
        } finally {
            this.hideLoading();
        }
    }

    // === TASKS TAB ===

    async loadTasks() {
        const tasksContainer = document.getElementById('tasksList');

        try {
            const response = await this.apiCall('/api/tasks?limit=20&withPriorities=true');

            if (response.success && response.tasks.length > 0) {
                tasksContainer.innerHTML = response.tasks.map(task => this.renderTaskCard(task)).join('');
            } else {
                tasksContainer.innerHTML = `
                    <div class="col-12 text-center py-5">
                        <i class="bi bi-inbox" style="font-size: 3rem; color: #6c757d;"></i>
                        <p class="mt-3 text-muted">Aucune tâche trouvée</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading tasks:', error);
            tasksContainer.innerHTML = `
                <div class="col-12 text-center py-5">
                    <i class="bi bi-exclamation-triangle text-warning" style="font-size: 3rem;"></i>
                    <p class="mt-3 text-muted">Erreur lors du chargement des tâches</p>
                </div>
            `;
        }
    }

    renderTaskCard(task) {
        const priority = task.priority_score ? (task.priority_score * 100).toFixed(0) : 0;
        const dueDate = task.dueDate ? new Date(task.dueDate).toLocaleDateString('fr-FR') : 'Aucune';

        return `
            <div class="col-md-6 mb-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start">
                            <h6 class="card-title">${this.escapeHtml(task.title)}</h6>
                            <span class="badge bg-primary">${priority}%</span>
                        </div>
                        ${task.content ? `<p class="card-text small text-muted">${this.escapeHtml(task.content.substring(0, 100))}...</p>` : ''}
                        <div class="row">
                            <div class="col-6">
                                <small class="text-muted">Échéance: ${dueDate}</small>
                            </div>
                            <div class="col-6 text-end">
                                ${task.tags ? task.tags.map(tag => `<span class="badge bg-secondary me-1">#${tag}</span>`).join('') : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async filterTasks() {
        // Implémentation du filtrage
        await this.loadTasks();
    }

    async prioritizeTasks() {
        this.showLoading();
        try {
            await this.apiCall('/api/tasks/prioritize', 'POST');
            this.showAlert('Priorisation calculée avec succès', 'success');
            await this.loadTasks();
        } catch (error) {
            this.showAlert('Erreur lors de la priorisation', 'danger');
        } finally {
            this.hideLoading();
        }
    }

    async refreshTasks() {
        await this.loadTasks();
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
                document.getElementById('schedulerState').textContent = status.status.isRunning ? 'Actif' : 'Inactif';
                document.getElementById('nextRun').textContent = status.status.nextRun ?
                    new Date(status.status.nextRun).toLocaleString('fr-FR') : '-';
                document.getElementById('lastRun').textContent = status.status.lastRun ?
                    new Date(status.status.lastRun).toLocaleString('fr-FR') : '-';
            }

            // Charger l'activité récente
            await this.loadSchedulerActivity();

        } catch (error) {
            console.error('Error loading scheduler:', error);
        }
    }

    async loadSchedulerActivity() {
        const activityContainer = document.getElementById('schedulerActivity');

        try {
            activityContainer.innerHTML = `
                <div class="text-muted">
                    <p>L'historique des exécutions apparaîtra ici.</p>
                </div>
            `;
        } catch (error) {
            console.error('Error loading scheduler activity:', error);
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
            case 'tasks':
                await this.loadTasks();
                break;
            case 'calendar':
                await this.loadCalendar();
                break;
            case 'scheduler':
                await this.loadScheduler();
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
        // Créer une alerte temporaire
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        // Insérer au début du container
        const container = document.querySelector('.container');
        container.insertBefore(alertDiv, container.firstChild);

        // Auto-remove après 5 secondes
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
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

            await this.apiCall('/api/config/save', 'POST', formData);

            this.showAlert('Paramètres sauvegardés avec succès', 'success');

            // Fermer la modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('configModal'));
            modal.hide();

        } catch (error) {
            console.error('Erreur sauvegarde config:', error);
            this.showAlert('Erreur lors de la sauvegarde des paramètres', 'danger');
        }
    }
}

// Global functions pour les event handlers HTML
window.executeCommand = () => app.executeCommand();
window.refreshTasks = () => app.refreshTasks();
window.filterTasks = () => app.filterTasks();
window.prioritizeTasks = () => app.prioritizeTasks();
window.syncCalendar = () => app.syncCalendar();
window.refreshCalendar = () => app.refreshCalendar();
window.startScheduler = () => app.startScheduler();
window.stopScheduler = () => app.stopScheduler();
window.runScheduler = () => app.runScheduler();
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
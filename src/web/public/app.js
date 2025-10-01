// TickTick Orchestrator - Frontend Application
class OrchestratorApp {
    constructor() {
        this.token = localStorage.getItem('token');
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
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });

        // Natural command input
        document.getElementById('naturalCommand').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.executeCommand();
            }
        });

        // Tab switching
        document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
            tab.addEventListener('shown.bs.tab', (e) => {
                const targetTab = e.target.getAttribute('data-bs-target').substring(1);
                this.handleTabSwitch(targetTab);
            });
        });

        // Auto-refresh every 30 seconds
        setInterval(() => {
            if (this.isAuthenticated) {
                this.refreshCurrentTab();
            }
        }, 30000);
    }

    // === AUTHENTICATION ===

    async checkAuth() {
        if (!this.token) {
            this.isAuthenticated = false;
            return;
        }

        try {
            const response = await this.apiCall('/auth/verify', 'GET');
            this.isAuthenticated = response.valid;

            if (!this.isAuthenticated) {
                localStorage.removeItem('token');
                this.token = null;
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            this.isAuthenticated = false;
            localStorage.removeItem('token');
            this.token = null;
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
                this.token = data.token;
                localStorage.setItem('token', this.token);
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

    logout() {
        localStorage.removeItem('token');
        this.token = null;
        this.isAuthenticated = false;
        this.updateAuthUI();
        this.showLoginModal();
        this.showAlert('Déconnecté avec succès', 'info');
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
            }
        };

        if (this.token) {
            config.headers['Authorization'] = `Bearer ${this.token}`;
        }

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
                resultDiv.innerHTML = `
                    <div class="alert alert-success">
                        <i class="bi bi-check-circle me-2"></i>
                        Commande exécutée avec succès
                    </div>
                `;
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

    showAuthModal() {
        // Modal pour gérer les authentifications TickTick/Google
        alert('Modal d\'authentification - À implémenter');
    }

    showConfigModal() {
        // Modal pour la configuration
        alert('Modal de configuration - À implémenter');
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

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new OrchestratorApp();
});
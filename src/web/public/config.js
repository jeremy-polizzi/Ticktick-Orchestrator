class ConfigApp {
    constructor() {
        this.init();
    }

    async init() {
        // Vérifier l'authentification se fait côté serveur via cookies

        // Charger les données initiales
        await this.loadCurrentConfig();
        await this.checkServiceStatus();
        this.setupEventListeners();
        this.checkUrlParams();
    }

    setupEventListeners() {
        // Formulaires de configuration
        document.getElementById('ticktickForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveTickTick();
        });

        document.getElementById('googleForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveGoogle();
        });

        document.getElementById('calendarForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveCalendars();
        });

        document.getElementById('securityForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSecurity();
        });

        // Vérification du status périodique
        setInterval(() => {
            this.checkServiceStatus();
        }, 30000); // Toutes les 30 secondes
    }

    checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);

        if (urlParams.get('config') === 'success') {
            const service = urlParams.get('service');
            this.showAlert(`Connexion ${service} réussie !`, 'success');
            // Nettoyer l'URL
            window.history.replaceState({}, document.title, window.location.pathname);
            // Recharger le status
            setTimeout(() => this.checkServiceStatus(), 1000);
        }

        if (urlParams.get('config') === 'error') {
            const service = urlParams.get('service');
            const error = urlParams.get('error');
            this.showAlert(`Erreur connexion ${service}: ${error}`, 'danger');
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    async loadCurrentConfig() {
        try {
            const response = await this.makeRequest('GET', '/api/config/current');

            if (response.success) {
                const config = response.config;

                // Remplir les calendriers
                if (config.calendar.jeremyCalendarId) {
                    document.getElementById('jeremyCalendarId').value = config.calendar.jeremyCalendarId;
                }
                if (config.calendar.businessCalendarId) {
                    document.getElementById('businessCalendarId').value = config.calendar.businessCalendarId;
                }
            }
        } catch (error) {
            console.error('Erreur chargement config:', error);
            this.showAlert('Erreur lors du chargement de la configuration', 'warning');
        }
    }

    async checkServiceStatus() {
        try {
            const response = await this.makeRequest('GET', '/api/config/status');

            if (response.success) {
                this.updateServiceStatus('ticktick', response.status.ticktick);
                this.updateServiceStatus('google', response.status.google);
            }
        } catch (error) {
            console.error('Erreur status:', error);
        }
    }

    updateServiceStatus(service, status) {
        const indicator = document.getElementById(`${service}Indicator`);
        const statusText = document.getElementById(`${service}StatusText`);
        const authBtn = document.getElementById(`${service}AuthBtn`);

        // Mettre à jour l'indicateur et le texte
        if (status.connected) {
            indicator.className = 'status-indicator status-connected';
            statusText.textContent = 'Connecté et fonctionnel';
            authBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Connecté';
            authBtn.className = 'btn btn-sm btn-success';
            authBtn.disabled = true;
        } else if (status.configured) {
            indicator.className = 'status-indicator status-configured';
            statusText.textContent = 'Configuré mais non connecté';
            authBtn.innerHTML = '<i class="bi bi-link-45deg me-1"></i>Connecter';
            authBtn.className = 'btn btn-sm btn-warning';
            authBtn.disabled = false;
        } else {
            indicator.className = 'status-indicator status-disconnected';
            statusText.textContent = 'Non configuré';
            authBtn.innerHTML = '<i class="bi bi-x-circle me-1"></i>Configurer';
            authBtn.className = 'btn btn-sm btn-danger';
            authBtn.disabled = false;
        }
    }

    async saveTickTick() {
        const clientId = document.getElementById('ticktickClientId').value.trim();
        const clientSecret = document.getElementById('ticktickClientSecret').value.trim();

        if (!clientId || !clientSecret) {
            this.showAlert('Veuillez remplir tous les champs TickTick', 'warning');
            return;
        }

        try {
            const response = await this.makeRequest('POST', '/api/config/save', {
                ticktickClientId: clientId,
                ticktickClientSecret: clientSecret
            });

            if (response.success) {
                this.showAlert('Configuration TickTick sauvegardée', 'success');
                // Nettoyer les champs
                document.getElementById('ticktickClientSecret').value = '';
                // Recharger le status
                setTimeout(() => this.checkServiceStatus(), 1000);
            } else {
                this.showAlert(response.error || 'Erreur sauvegarde TickTick', 'danger');
            }
        } catch (error) {
            console.error('Erreur sauvegarde TickTick:', error);
            this.showAlert('Erreur lors de la sauvegarde TickTick', 'danger');
        }
    }

    async saveGoogle() {
        const clientId = document.getElementById('googleClientId').value.trim();
        const clientSecret = document.getElementById('googleClientSecret').value.trim();

        if (!clientId || !clientSecret) {
            this.showAlert('Veuillez remplir tous les champs Google', 'warning');
            return;
        }

        try {
            const response = await this.makeRequest('POST', '/api/config/save', {
                googleClientId: clientId,
                googleClientSecret: clientSecret
            });

            if (response.success) {
                this.showAlert('Configuration Google sauvegardée', 'success');
                // Nettoyer les champs
                document.getElementById('googleClientSecret').value = '';
                // Recharger le status
                setTimeout(() => this.checkServiceStatus(), 1000);
            } else {
                this.showAlert(response.error || 'Erreur sauvegarde Google', 'danger');
            }
        } catch (error) {
            console.error('Erreur sauvegarde Google:', error);
            this.showAlert('Erreur lors de la sauvegarde Google', 'danger');
        }
    }

    async saveCalendars() {
        const jeremyCalendarId = document.getElementById('jeremyCalendarId').value.trim();
        const businessCalendarId = document.getElementById('businessCalendarId').value.trim();

        if (!jeremyCalendarId || !businessCalendarId) {
            this.showAlert('Veuillez remplir tous les champs calendrier', 'warning');
            return;
        }

        try {
            const response = await this.makeRequest('POST', '/api/config/save', {
                jeremyCalendarId: jeremyCalendarId,
                businessCalendarId: businessCalendarId
            });

            if (response.success) {
                this.showAlert('Configuration calendriers sauvegardée', 'success');
            } else {
                this.showAlert(response.error || 'Erreur sauvegarde calendriers', 'danger');
            }
        } catch (error) {
            console.error('Erreur sauvegarde calendriers:', error);
            this.showAlert('Erreur lors de la sauvegarde calendriers', 'danger');
        }
    }

    async saveSecurity() {
        const adminPassword = document.getElementById('adminPassword').value.trim();
        const jwtSecret = document.getElementById('jwtSecret').value.trim();

        if (!adminPassword && !jwtSecret) {
            this.showAlert('Aucun changement de sécurité détecté', 'info');
            return;
        }

        try {
            const data = {};
            if (adminPassword) data.adminPassword = adminPassword;
            if (jwtSecret) data.jwtSecret = jwtSecret;

            const response = await this.makeRequest('POST', '/api/config/save', data);

            if (response.success) {
                this.showAlert('Configuration sécurité sauvegardée. Redémarrage recommandé.', 'success');
                // Nettoyer les champs
                document.getElementById('adminPassword').value = '';
                document.getElementById('jwtSecret').value = '';
            } else {
                this.showAlert(response.error || 'Erreur sauvegarde sécurité', 'danger');
            }
        } catch (error) {
            console.error('Erreur sauvegarde sécurité:', error);
            this.showAlert('Erreur lors de la sauvegarde sécurité', 'danger');
        }
    }

    async testTickTick() {
        const clientId = document.getElementById('ticktickClientId').value.trim();
        const clientSecret = document.getElementById('ticktickClientSecret').value.trim();

        if (!clientId || !clientSecret) {
            this.showAlert('Veuillez remplir les champs TickTick avant de tester', 'warning');
            return;
        }

        try {
            const response = await this.makeRequest('POST', '/api/config/test/ticktick', {
                clientId: clientId,
                clientSecret: clientSecret
            });

            if (response.success) {
                this.showAlert('Configuration TickTick valide !', 'success');
            } else {
                this.showAlert(response.error || 'Configuration TickTick invalide', 'danger');
            }
        } catch (error) {
            console.error('Erreur test TickTick:', error);
            this.showAlert('Erreur lors du test TickTick', 'danger');
        }
    }

    async testGoogle() {
        const clientId = document.getElementById('googleClientId').value.trim();
        const clientSecret = document.getElementById('googleClientSecret').value.trim();

        if (!clientId || !clientSecret) {
            this.showAlert('Veuillez remplir les champs Google avant de tester', 'warning');
            return;
        }

        try {
            const response = await this.makeRequest('POST', '/api/config/test/google', {
                clientId: clientId,
                clientSecret: clientSecret
            });

            if (response.success) {
                this.showAlert('Configuration Google valide !', 'success');
            } else {
                this.showAlert(response.error || 'Configuration Google invalide', 'danger');
            }
        } catch (error) {
            console.error('Erreur test Google:', error);
            this.showAlert('Erreur lors du test Google', 'danger');
        }
    }

    async authorizeTickTick() {
        try {
            // Vérifier que la configuration est sauvegardée
            const clientId = document.getElementById('ticktickClientId').value.trim();
            if (!clientId) {
                this.showAlert('Veuillez d\'abord sauvegarder la configuration TickTick', 'warning');
                return;
            }

            // Rediriger vers l'autorisation
            window.location.href = '/api/config/auth/ticktick';
        } catch (error) {
            console.error('Erreur autorisation TickTick:', error);
            this.showAlert('Erreur lors de l\'autorisation TickTick', 'danger');
        }
    }

    async authorizeGoogle() {
        try {
            // Vérifier que la configuration est sauvegardée
            const clientId = document.getElementById('googleClientId').value.trim();
            if (!clientId) {
                this.showAlert('Veuillez d\'abord sauvegarder la configuration Google', 'warning');
                return;
            }

            // Rediriger vers l'autorisation
            window.location.href = '/api/config/auth/google';
        } catch (error) {
            console.error('Erreur autorisation Google:', error);
            this.showAlert('Erreur lors de l\'autorisation Google', 'danger');
        }
    }

    async restartSystem() {
        if (!confirm('Êtes-vous sûr de vouloir redémarrer le système ?')) {
            return;
        }

        try {
            await this.makeRequest('POST', '/api/system/restart');
            this.showAlert('Redémarrage du système en cours...', 'info');

            // Attendre et recharger la page
            setTimeout(() => {
                window.location.reload();
            }, 5000);
        } catch (error) {
            console.error('Erreur redémarrage:', error);
            this.showAlert('Erreur lors du redémarrage', 'danger');
        }
    }

    async exportConfig() {
        try {
            const response = await this.makeRequest('GET', '/api/config/current');
            if (response.success) {
                const configBlob = new Blob([JSON.stringify(response.config, null, 2)], {
                    type: 'application/json'
                });

                const url = URL.createObjectURL(configBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ticktick-orchestrator-config-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                this.showAlert('Configuration exportée avec succès', 'success');
            }
        } catch (error) {
            console.error('Erreur export:', error);
            this.showAlert('Erreur lors de l\'export', 'danger');
        }
    }

    loadConfig() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const config = JSON.parse(e.target.result);
                        this.applyConfig(config);
                    } catch (error) {
                        this.showAlert('Fichier de configuration invalide', 'danger');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }

    applyConfig(config) {
        try {
            // Appliquer les valeurs des calendriers
            if (config.calendar?.jeremyCalendarId) {
                document.getElementById('jeremyCalendarId').value = config.calendar.jeremyCalendarId;
            }
            if (config.calendar?.businessCalendarId) {
                document.getElementById('businessCalendarId').value = config.calendar.businessCalendarId;
            }

            this.showAlert('Configuration chargée. Veuillez sauvegarder les modifications.', 'info');
        } catch (error) {
            this.showAlert('Erreur lors de l\'application de la configuration', 'danger');
        }
    }

    async makeRequest(method, url, data = null) {
        const config = {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        };

        if (data && method !== 'GET') {
            config.body = JSON.stringify(data);
        }

        const response = await fetch(url, config);

        if (response.status === 401) {
            window.location.href = '/login?error=expired';
            return;
        }

        return await response.json();
    }

    showAlert(message, type = 'info') {
        const alertContainer = document.getElementById('alertContainer');
        const alertId = 'alert-' + Date.now();

        const alertDiv = document.createElement('div');
        alertDiv.id = alertId;
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;

        let icon = 'bi-info-circle';
        switch (type) {
            case 'success': icon = 'bi-check-circle'; break;
            case 'warning': icon = 'bi-exclamation-triangle'; break;
            case 'danger': icon = 'bi-x-circle'; break;
        }

        alertDiv.innerHTML = `
            <i class="bi ${icon} me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        alertContainer.appendChild(alertDiv);

        // Auto-remove après 5 secondes
        setTimeout(() => {
            const alert = document.getElementById(alertId);
            if (alert) {
                const bsAlert = new bootstrap.Alert(alert);
                bsAlert.close();
            }
        }, 5000);
    }
}

// Fonctions globales pour les boutons
function testTickTick() {
    window.configApp.testTickTick();
}

function testGoogle() {
    window.configApp.testGoogle();
}

function authorizeTickTick() {
    window.configApp.authorizeTickTick();
}

function authorizeGoogle() {
    window.configApp.authorizeGoogle();
}

function restartSystem() {
    window.configApp.restartSystem();
}

function exportConfig() {
    window.configApp.exportConfig();
}

function loadConfig() {
    window.configApp.loadConfig();
}

function logout() {
    // La déconnexion se fait côté serveur via API
    fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include'
    }).then(() => {
        window.location.href = '/login?logout=success';
    });
}

function goToDashboard() {
    window.location.href = '/dashboard';
}

function goHome() {
    window.location.href = '/';
}

// Fonction pour toggle la visibilité des mots de passe
function togglePassword(fieldId) {
    const field = document.getElementById(fieldId);
    const icon = document.getElementById(fieldId.replace('Secret', 'SecretIcon'));

    if (field.type === 'password') {
        field.type = 'text';
        icon.className = 'bi bi-eye-slash';
    } else {
        field.type = 'password';
        icon.className = 'bi bi-eye';
    }
}

// Fonction pour pré-remplir les champs avec les valeurs actuelles
function populateCurrentValues(config) {
    // Remplir les champs TickTick si disponibles
    if (config.ticktick?.clientId && config.ticktick.clientId !== '***configured***') {
        document.getElementById('ticktickClientId').value = config.ticktick.clientId;
    }

    // Remplir les champs Google si disponibles
    if (config.google?.clientId && config.google.clientId !== '***configured***') {
        document.getElementById('googleClientId').value = config.google.clientId;
    }

    // Pour les secrets, on ne les affiche pas mais on indique s'ils sont configurés
    if (config.ticktick?.clientId === '***configured***') {
        document.getElementById('ticktickClientSecret').placeholder = '••••••••••••••• (configuré)';
    }

    if (config.google?.clientId === '***configured***') {
        document.getElementById('googleClientSecret').placeholder = '••••••••••••••• (configuré)';
    }
}

// Amélioration de la fonction loadCurrentConfig pour utiliser le pré-remplissage
function enhanceConfigLoading() {
    const originalLoad = window.configApp?.loadCurrentConfig;
    if (originalLoad) {
        window.configApp.loadCurrentConfig = async function() {
            await originalLoad.call(this);
            const response = await this.makeRequest('GET', '/api/config/current');
            if (response.success) {
                populateCurrentValues(response.config);
            }
        };
    }
}

// Initialiser l'application
document.addEventListener('DOMContentLoaded', () => {
    window.configApp = new ConfigApp();
    // Améliorer le chargement après l'initialisation
    setTimeout(enhanceConfigLoading, 100);
});
const Airtable = require('airtable');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class AirtableAPI {
  constructor() {
    this.base = null;
    this.baseId = 'appuWjjvWTTl4QUS8'; // CRM Cap Numérique
    this.isConnected = false;
  }

  async initialize() {
    try {
      // Charger le token depuis le fichier MCP config
      const mcpConfigPath = path.join(__dirname, '../../.claude/mcp.json');

      if (fs.existsSync(mcpConfigPath)) {
        const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
        const apiKey = mcpConfig.mcpServers?.airtable?.env?.AIRTABLE_API_KEY;

        if (!apiKey) {
          logger.error('Token Airtable non trouvé dans .claude/mcp.json');
          return false;
        }

        // Initialiser Airtable
        Airtable.configure({
          apiKey: apiKey
        });

        this.base = Airtable.base(this.baseId);
        this.isConnected = true;

        logger.info('Airtable API initialisée avec succès');
        return true;
      } else {
        logger.warn('Fichier MCP config non trouvé');
        return false;
      }
    } catch (error) {
      logger.error('Erreur lors de l\'initialisation Airtable API:', error.message);
      return false;
    }
  }

  // === EXPLORATION DES TABLES ===

  async listTables() {
    try {
      // Airtable SDK ne permet pas de lister les tables directement via l'API
      // On doit les connaître à l'avance ou utiliser l'API Meta
      // Pour l'instant, retourner les tables connues de l'URL

      const knownTables = [
        { id: 'tbl6NXwfDg7ZtYE7a', name: 'Table principale (à identifier)' }
      ];

      logger.info(`Tables Airtable connues: ${knownTables.length}`);
      return knownTables;
    } catch (error) {
      logger.error('Erreur lors de la liste des tables:', error.message);
      return [];
    }
  }

  // === RÉCUPÉRATION DES PROSPECTS ===

  async getProspects(tableName = 'tbl6NXwfDg7ZtYE7a', options = {}) {
    try {
      if (!this.isConnected) {
        await this.initialize();
      }

      const records = [];

      // Requête Airtable avec options
      const selectOptions = {
        maxRecords: options.maxRecords || 100,
        ...options
      };

      // Ajouter la vue seulement si spécifiée
      if (options.view) {
        selectOptions.view = options.view;
      }

      const query = this.base(tableName).select(selectOptions);

      // Récupérer tous les enregistrements
      await query.eachPage((pageRecords, fetchNextPage) => {
        pageRecords.forEach(record => {
          records.push({
            id: record.id,
            fields: record.fields,
            createdTime: record._rawJson.createdTime
          });
        });
        fetchNextPage();
      });

      logger.info(`${records.length} enregistrements récupérés de la table ${tableName}`);
      return records;
    } catch (error) {
      logger.error(`Erreur lors de la récupération des prospects:`, error.message);
      throw error;
    }
  }

  // === RÉCUPÉRATION D'UN ENREGISTREMENT SPÉCIFIQUE ===

  async getRecord(tableName, recordId) {
    try {
      if (!this.isConnected) {
        await this.initialize();
      }

      const record = await this.base(tableName).find(recordId);

      return {
        id: record.id,
        fields: record.fields,
        createdTime: record._rawJson.createdTime
      };
    } catch (error) {
      logger.error(`Erreur lors de la récupération de l'enregistrement ${recordId}:`, error.message);
      throw error;
    }
  }

  // === MISE À JOUR D'UN ENREGISTREMENT ===

  async updateRecord(tableName, recordId, fields) {
    try {
      if (!this.isConnected) {
        await this.initialize();
      }

      const updatedRecord = await this.base(tableName).update(recordId, fields);

      logger.info(`Enregistrement ${recordId} mis à jour dans ${tableName}`);
      return {
        id: updatedRecord.id,
        fields: updatedRecord.fields
      };
    } catch (error) {
      logger.error(`Erreur lors de la mise à jour de l'enregistrement ${recordId}:`, error.message);
      throw error;
    }
  }

  // === CRÉATION D'UN ENREGISTREMENT ===

  async createRecord(tableName, fields) {
    try {
      if (!this.isConnected) {
        await this.initialize();
      }

      const newRecord = await this.base(tableName).create(fields);

      logger.info(`Nouvel enregistrement créé dans ${tableName}`);
      return {
        id: newRecord.id,
        fields: newRecord.fields
      };
    } catch (error) {
      logger.error(`Erreur lors de la création de l'enregistrement:`, error.message);
      throw error;
    }
  }

  // === STATISTIQUES CRM CAP NUMÉRIQUE ===

  async getCapNumeriqueStats() {
    try {
      const prospects = await this.getProspects();

      // Champs réels Airtable détectés:
      // Prénom, Nom, Téléphone, Email, Objectif, Statut, Société,
      // Commentaire, Date de création, Dernière modification,
      // Dernière modification de statut, Provenance, Campagne Wbiztool

      const stats = {
        totalProspects: prospects.length,
        nonContactes: 0,
        enCours: 0,
        documentsAttendus: 0,
        valides: 0,
        revenuGenere: 0,
        revenuPotentiel: 0,
        parStatut: {},
        parProvenance: {},
        parCampagne: {}
      };

      prospects.forEach(prospect => {
        const fields = prospect.fields;
        const statut = fields['Statut'] || 'Non renseigné';

        // Compter par statut
        if (!stats.parStatut[statut]) {
          stats.parStatut[statut] = 0;
        }
        stats.parStatut[statut]++;

        // Statistiques spécifiques
        if (statut === 'Non contacté') {
          stats.nonContactes++;
        } else if (statut.includes('En cours') || statut.includes('en cours')) {
          stats.enCours++;
          stats.revenuPotentiel += 640; // 640€ par dossier potentiel
        } else if (statut === 'Validé' || statut === 'Dossier validé') {
          stats.valides++;
          stats.revenuGenere += 640; // 640€ par dossier validé
        } else if (statut.includes('Documents') || statut.includes('En attente')) {
          stats.documentsAttendus++;
        }

        // Par provenance
        const provenance = fields['Provenance'] || 'Non renseigné';
        if (!stats.parProvenance[provenance]) {
          stats.parProvenance[provenance] = 0;
        }
        stats.parProvenance[provenance]++;

        // Par campagne
        const campagne = fields['Campagne Wbiztool'] || 'Non renseigné';
        if (!stats.parCampagne[campagne]) {
          stats.parCampagne[campagne] = 0;
        }
        stats.parCampagne[campagne]++;
      });

      return stats;
    } catch (error) {
      logger.error('Erreur lors du calcul des stats Cap Numérique:', error.message);
      throw error;
    }
  }

  // === DÉTECTION PROSPECTS À RELANCER ===

  async getProspectsToRecontact(daysThreshold = 3) {
    try {
      const prospects = await this.getProspects();
      const now = new Date();
      const toRecontact = [];

      prospects.forEach(prospect => {
        const fields = prospect.fields;
        const lastContactDate = fields['Dernier contact'] ? new Date(fields['Dernier contact']) : null;

        if (lastContactDate) {
          const daysSinceContact = Math.floor((now - lastContactDate) / (1000 * 60 * 60 * 24));

          if (daysSinceContact >= daysThreshold && fields['Statut'] !== 'Validé') {
            toRecontact.push({
              id: prospect.id,
              nom: fields['Nom'] || 'N/A',
              daysSinceContact,
              statut: fields['Statut'] || 'N/A',
              telephone: fields['Téléphone'] || fields['WhatsApp'] || 'N/A'
            });
          }
        }
      });

      logger.info(`${toRecontact.length} prospects à relancer (>${daysThreshold} jours sans contact)`);
      return toRecontact;
    } catch (error) {
      logger.error('Erreur lors de la détection des prospects à relancer:', error.message);
      return [];
    }
  }
}

module.exports = AirtableAPI;

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');

// === ROUTES BACKUP/RESTORE ===

/**
 * Créer un snapshot manuel
 * POST /api/backup/snapshot
 */
router.post('/snapshot', async (req, res) => {
  try {
    const { reason } = req.body;
    const backupManager = req.app.get('backupManager');

    if (!backupManager) {
      return res.status(503).json({
        success: false,
        error: 'BackupManager non disponible'
      });
    }

    logger.info(`📸 Création snapshot manuel: ${reason || 'manual'}`);
    const result = await backupManager.createSnapshot(reason || 'manual');

    if (result.success) {
      res.json({
        success: true,
        message: 'Snapshot créé avec succès',
        snapshot: {
          id: result.snapshotId,
          calendarEvents: result.snapshot.metadata.calendarEventsCount,
          ticktickTasks: result.snapshot.metadata.ticktickTasksCount,
          duration: result.snapshot.metadata.duration
        },
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    logger.error('Erreur lors de la création du snapshot:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création du snapshot',
      details: error.message
    });
  }
});

/**
 * Lister tous les snapshots disponibles
 * GET /api/backup/list
 */
router.get('/list', async (req, res) => {
  try {
    const backupManager = req.app.get('backupManager');

    if (!backupManager) {
      return res.status(503).json({
        success: false,
        error: 'BackupManager non disponible'
      });
    }

    const snapshots = await backupManager.listSnapshots();

    res.json({
      success: true,
      snapshots,
      count: snapshots.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors de la liste des snapshots:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des snapshots',
      details: error.message
    });
  }
});

/**
 * Restaurer depuis un snapshot
 * POST /api/backup/restore/:snapshotId
 */
router.post('/restore/:snapshotId', async (req, res) => {
  try {
    const { snapshotId } = req.params;
    const backupManager = req.app.get('backupManager');

    if (!backupManager) {
      return res.status(503).json({
        success: false,
        error: 'BackupManager non disponible'
      });
    }

    logger.info(`🔄 Restauration depuis snapshot: ${snapshotId}`);
    const result = await backupManager.restore(snapshotId);

    if (result.success) {
      res.json({
        success: true,
        message: 'Restauration terminée avec succès',
        snapshotId: result.snapshotId,
        preRestoreSnapshot: result.preRestoreSnapshot,
        restored: {
          calendar: {
            created: result.restored.calendar.created,
            deleted: result.restored.calendar.deleted,
            errors: result.restored.calendar.errors.length
          },
          ticktick: {
            created: result.restored.ticktick.created,
            deleted: result.restored.ticktick.deleted,
            errors: result.restored.ticktick.errors.length
          }
        },
        duration: result.duration,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    logger.error('Erreur lors de la restauration:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la restauration',
      details: error.message
    });
  }
});

/**
 * Vérifier le niveau de chaos
 * GET /api/backup/chaos-check
 */
router.get('/chaos-check', async (req, res) => {
  try {
    const backupManager = req.app.get('backupManager');

    if (!backupManager) {
      return res.status(503).json({
        success: false,
        error: 'BackupManager non disponible'
      });
    }

    const chaosReport = await backupManager.detectChaos();

    res.json({
      success: true,
      chaos: {
        detected: chaosReport.chaosDetected,
        level: chaosReport.chaosLevel,
        issues: chaosReport.issues,
        recommendation: chaosReport.recommendation
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors de la détection du chaos:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la détection du chaos',
      details: error.message
    });
  }
});

/**
 * Supprimer un snapshot
 * DELETE /api/backup/:snapshotId
 */
router.delete('/:snapshotId', async (req, res) => {
  try {
    const { snapshotId } = req.params;
    const backupManager = req.app.get('backupManager');

    if (!backupManager) {
      return res.status(503).json({
        success: false,
        error: 'BackupManager non disponible'
      });
    }

    const deleted = await backupManager.deleteSnapshot(snapshotId);

    if (deleted) {
      res.json({
        success: true,
        message: 'Snapshot supprimé',
        snapshotId
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Snapshot non trouvé'
      });
    }

  } catch (error) {
    logger.error('Erreur lors de la suppression du snapshot:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression',
      details: error.message
    });
  }
});

/**
 * Récupérer l'historique des actions backup/restore
 * GET /api/backup/history
 */
router.get('/history', async (req, res) => {
  try {
    const backupManager = req.app.get('backupManager');

    if (!backupManager) {
      return res.status(503).json({
        success: false,
        error: 'BackupManager non disponible'
      });
    }

    const limit = parseInt(req.query.limit) || 50;
    const history = backupManager.getHistory(limit);

    res.json({
      success: true,
      history,
      count: history.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erreur lors de la récupération de l\'historique:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération de l\'historique',
      details: error.message
    });
  }
});

module.exports = router;

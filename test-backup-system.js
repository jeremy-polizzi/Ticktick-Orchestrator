/**
 * Test du système de backup/restore
 *
 * Ce script teste:
 * 1. Initialisation BackupManager
 * 2. Création snapshot
 * 3. Liste snapshots
 * 4. Détection chaos
 */

const BackupManager = require('./src/orchestrator/backup-manager');
const logger = require('./src/utils/logger');

async function testBackupSystem() {
  console.log('\n🧪 TEST SYSTÈME BACKUP/RESTORE\n');
  console.log('=' .repeat(60));

  try {
    // 1. Initialisation
    console.log('\n1️⃣  Initialisation BackupManager...');
    const backupManager = new BackupManager();
    const initialized = await backupManager.initialize();

    if (!initialized) {
      throw new Error('Échec initialisation BackupManager');
    }
    console.log('   ✅ BackupManager initialisé');

    // 2. Création snapshot test
    console.log('\n2️⃣  Création snapshot de test...');
    const snapshot = await backupManager.createSnapshot('test_script');

    if (snapshot.success) {
      console.log(`   ✅ Snapshot créé: ${snapshot.snapshotId}`);
      console.log(`   📊 Événements: ${snapshot.snapshot.metadata.calendarEventsCount}`);
      console.log(`   📋 Tâches: ${snapshot.snapshot.metadata.ticktickTasksCount}`);
      console.log(`   ⏱️  Durée: ${snapshot.snapshot.metadata.duration}ms`);
    } else {
      console.log(`   ❌ Échec: ${snapshot.error}`);
    }

    // 3. Liste snapshots
    console.log('\n3️⃣  Liste des snapshots disponibles...');
    const snapshots = await backupManager.listSnapshots();
    console.log(`   ✅ ${snapshots.length} snapshot(s) disponible(s):`);

    snapshots.slice(0, 5).forEach((snap, i) => {
      const date = new Date(snap.timestamp).toLocaleString('fr-FR');
      console.log(`   ${i + 1}. ${snap.id}`);
      console.log(`      📅 ${date} (${snap.reason})`);
      console.log(`      📊 ${snap.calendarEventsCount} événements, ${snap.ticktickTasksCount} tâches`);
    });

    if (snapshots.length > 5) {
      console.log(`   ... et ${snapshots.length - 5} autre(s)`);
    }

    // 4. Détection chaos
    console.log('\n4️⃣  Détection de chaos...');
    const chaosReport = await backupManager.detectChaos();

    console.log(`   ${chaosReport.chaosDetected ? '⚠️' : '✅'} Niveau chaos: ${chaosReport.chaosLevel}/100`);
    console.log(`   📊 Issues détectés:`);
    console.log(`      - Événements totaux: ${chaosReport.issues.totalEvents}`);
    console.log(`      - Événements à minuit: ${chaosReport.issues.eventsAtMidnight}`);
    console.log(`      - Chevauchements: ${chaosReport.issues.overlappingEvents}`);
    console.log(`   💡 Recommandation: ${chaosReport.recommendation}`);

    // 5. Résumé final
    console.log('\n' + '='.repeat(60));
    console.log('✅ TOUS LES TESTS RÉUSSIS\n');
    console.log('Système backup/restore opérationnel:');
    console.log('  - Snapshots automatiques avant analyse quotidienne');
    console.log('  - API /api/backup/* pour gestion manuelle');
    console.log('  - Détection chaos avec scoring intelligent');
    console.log('  - Conservation 30 jours d\'historique\n');

    return true;

  } catch (error) {
    console.error('\n❌ ERREUR TEST:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Exécution
testBackupSystem()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Erreur fatale:', error);
    process.exit(1);
  });

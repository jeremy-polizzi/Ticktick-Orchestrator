#!/usr/bin/env node

/**
 * Script de test pour la planification sur 60 jours
 * Vérifie:
 * - Distribution sur l'horizon complet de 60 jours
 * - Charge légère (2 tâches max/jour)
 * - Équilibrage automatique de la charge
 * - Pas de jours surchargés
 */

const DailyScheduler = require('./src/scheduler/daily-scheduler');
const logger = require('./src/utils/logger');
const config = require('./src/config/config');

async function test60DayPlanning() {
  console.log('\n🧪 Test de la planification intelligente sur 60 jours\n');
  console.log('='.repeat(70));

  try {
    // Initialiser le scheduler
    const scheduler = new DailyScheduler();
    await scheduler.initialize();

    console.log(`\n📊 Configuration:`);
    console.log(`  - Horizon de planification: ${config.scheduler.planningHorizonDays} jours`);
    console.log(`  - Charge maximale par jour: ${config.scheduler.maxDailyTasks} tâches`);
    console.log(`  - Capacité totale: ${config.scheduler.planningHorizonDays * config.scheduler.maxDailyTasks} tâches`);

    // Test 1: Analyser les créneaux disponibles sur 60 jours
    console.log('\n\n📅 Test 1: Analyse des créneaux sur 60 jours\n');

    const availableSlots = await scheduler.analyzeAvailableSlots();

    console.log(`  ✅ Créneaux analysés: ${availableSlots.size} jours`);

    // Statistiques des créneaux
    let daysWithSlots = 0;
    let totalSlots = 0;
    let daysWithSport = 0;

    for (const [day, slots] of availableSlots.entries()) {
      if (slots.length > 0) {
        daysWithSlots++;
        totalSlots += slots.length;

        if (slots[0].hasSport) {
          daysWithSport++;
        }
      }
    }

    console.log(`  - Jours avec créneaux disponibles: ${daysWithSlots}/${availableSlots.size}`);
    console.log(`  - Total créneaux disponibles: ${totalSlots}`);
    console.log(`  - Jours avec sport détecté: ${daysWithSport}`);
    console.log(`  - Moyenne créneaux/jour: ${(totalSlots / daysWithSlots).toFixed(1)}`);

    // Test 2: Simuler une distribution de tâches
    console.log('\n\n📝 Test 2: Simulation de distribution de tâches\n');

    // Créer des tâches de test simulées
    const mockTasks = [];
    for (let i = 1; i <= 50; i++) {
      mockTasks.push({
        id: `test-${i}`,
        title: `Tâche de test ${i}`,
        content: i % 3 === 0 ? 'Développement feature' : i % 3 === 1 ? 'Appel client' : 'Email administratif',
        priority: Math.floor(Math.random() * 5) + 1,
        tags: i % 10 === 0 ? ['urgent'] : [],
        dueDate: null // Pas de date = à planifier
      });
    }

    console.log(`  Tâches à distribuer: ${mockTasks.length}`);

    // Calculer les priorités (simuler)
    const prioritizedTasks = mockTasks.map((task, index) => ({
      ...task,
      calculatedPriority: task.priority + (task.tags.includes('urgent') ? 10 : 0) + (1 / (index + 1))
    })).sort((a, b) => b.calculatedPriority - a.calculatedPriority);

    // Distribuer les tâches
    const distribution = await scheduler.distributeTasks(prioritizedTasks, availableSlots);

    console.log(`\n  ✅ Distribution effectuée:`);

    const distributedDays = Object.keys(distribution);
    const totalDistributed = Object.values(distribution).reduce((sum, tasks) => sum + tasks.length, 0);

    console.log(`    - Tâches distribuées: ${totalDistributed}/${mockTasks.length}`);
    console.log(`    - Jours utilisés: ${distributedDays.length}`);
    console.log(`    - Charge moyenne: ${(totalDistributed / distributedDays.length).toFixed(2)} tâches/jour`);

    // Test 3: Vérifier l'équilibrage
    console.log('\n\n⚖️  Test 3: Vérification de l\'équilibrage\n');

    const loads = Object.entries(distribution).map(([day, tasks]) => ({
      day,
      load: tasks.length
    }));

    const maxLoad = Math.max(...loads.map(d => d.load));
    const minLoad = Math.min(...loads.map(d => d.load));
    const avgLoad = totalDistributed / distributedDays.length;

    console.log(`  - Charge minimale: ${minLoad} tâches/jour`);
    console.log(`  - Charge maximale: ${maxLoad} tâches/jour`);
    console.log(`  - Charge moyenne: ${avgLoad.toFixed(2)} tâches/jour`);
    console.log(`  - Écart: ${maxLoad - minLoad} tâches`);

    // Vérifier les règles
    const violations = loads.filter(d => d.load > config.scheduler.maxDailyTasks);

    if (violations.length > 0) {
      console.log(`\n  ❌ ${violations.length} jours dépassent la charge maximale:`);
      violations.forEach(v => {
        console.log(`    - ${v.day}: ${v.load} tâches (max: ${config.scheduler.maxDailyTasks})`);
      });
    } else {
      console.log(`\n  ✅ Aucun jour ne dépasse la charge maximale (${config.scheduler.maxDailyTasks} tâches/jour)`);
    }

    // Test 4: Vérifier la répartition temporelle
    console.log('\n\n📆 Test 4: Répartition temporelle\n');

    // Grouper par semaine
    const weeks = {};
    for (const [day, tasks] of Object.entries(distribution)) {
      const date = new Date(day);
      const weekNumber = Math.floor((date - new Date()) / (7 * 24 * 60 * 60 * 1000));

      if (!weeks[weekNumber]) {
        weeks[weekNumber] = { tasks: 0, days: 0 };
      }
      weeks[weekNumber].tasks += tasks.length;
      weeks[weekNumber].days++;
    }

    console.log(`  Répartition par semaine (${Object.keys(weeks).length} premières semaines utilisées):`);

    Object.entries(weeks).slice(0, 8).forEach(([weekNum, data]) => {
      const weekStart = Math.floor(parseInt(weekNum));
      console.log(`    Semaine ${parseInt(weekNum) + 1}: ${data.tasks} tâches sur ${data.days} jours (${(data.tasks / data.days).toFixed(1)} tâches/jour)`);
    });

    // Test 5: Afficher un échantillon de la distribution
    console.log('\n\n📋 Test 5: Échantillon de distribution (10 premiers jours)\n');

    const sortedDays = Object.keys(distribution).sort();
    sortedDays.slice(0, 10).forEach(day => {
      const date = new Date(day);
      const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' });
      const dateStr = date.toLocaleDateString('fr-FR');
      const tasks = distribution[day];

      console.log(`\n  ${dayName} ${dateStr} (${tasks.length} tâche${tasks.length > 1 ? 's' : ''}):`);
      tasks.forEach(task => {
        console.log(`    - ${task.title}`);
      });
    });

    console.log('\n' + '='.repeat(70));
    console.log('\n✅ Tests de planification 60 jours terminés avec succès\n');

  } catch (error) {
    console.error('\n❌ Erreur lors des tests:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Exécuter les tests
test60DayPlanning()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Erreur fatale:', error);
    process.exit(1);
  });

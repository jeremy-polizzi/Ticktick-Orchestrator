#!/usr/bin/env node

/**
 * Script de test pour les nouvelles règles de planification
 * Teste:
 * - Détection des jours avec sport
 * - Espacement entre événements (buffer)
 * - Exclusion des créneaux du matin (jours avec sport)
 */

const GoogleCalendarAPI = require('./src/api/google-calendar-api');
const CalendarSync = require('./src/orchestrator/calendar-sync');
const logger = require('./src/utils/logger');
const config = require('./src/config/config');

async function testSchedulingRules() {
  console.log('\n🧪 Test des nouvelles règles de planification\n');
  console.log('='.repeat(60));

  try {
    // Initialiser les APIs
    const googleCalendar = new GoogleCalendarAPI();
    await googleCalendar.loadTokens();

    const calendarSync = new CalendarSync();
    await calendarSync.initialize();

    // Test 1: Analyser les créneaux pour les 7 prochains jours
    console.log('\n📅 Test 1: Analyse des créneaux disponibles\n');

    for (let i = 0; i < 7; i++) {
      const testDate = new Date();
      testDate.setDate(testDate.getDate() + i);

      const slots = await googleCalendar.getAvailableSlots(
        [config.calendars.jeremy, config.calendars.business],
        testDate,
        60, // 1 heure minimum
        {
          bufferMinutes: 15,
          excludeMorning: true,
          morningEndHour: 12
        }
      );

      const dayName = testDate.toLocaleDateString('fr-FR', { weekday: 'long' });
      const dateStr = testDate.toLocaleDateString('fr-FR');

      console.log(`\n${dayName} ${dateStr}:`);
      console.log(`  Sport détecté: ${slots.length > 0 ? slots[0].hasSport : 'N/A'}`);
      console.log(`  Créneaux disponibles: ${slots.length}`);

      if (slots.length > 0) {
        slots.forEach((slot, idx) => {
          const startTime = slot.start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          const endTime = slot.end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          const durationHours = (slot.duration / 60).toFixed(1);
          console.log(`  ${idx + 1}. ${startTime} - ${endTime} (${durationHours}h)`);
        });
      } else {
        console.log('  ❌ Aucun créneau disponible');
      }
    }

    // Test 2: Simuler la planification d'une tâche
    console.log('\n\n📝 Test 2: Planification d\'une tâche test\n');

    const testTask = {
      id: 'test-' + Date.now(),
      title: 'Tâche de test - Développement feature X',
      content: 'Test de la planification intelligente avec espacement',
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Demain
      allDay: true,
      tags: [],
      priority: 3
    };

    console.log(`Tâche: ${testTask.title}`);
    console.log(`Date cible: ${new Date(testTask.dueDate).toLocaleDateString('fr-FR')}`);

    const scheduledSlot = await calendarSync.scheduleTaskInSlot(
      testTask,
      new Date(testTask.dueDate)
    );

    if (scheduledSlot) {
      console.log(`\n✅ Tâche planifiée avec succès:`);
      console.log(`  Début: ${scheduledSlot.start.toLocaleString('fr-FR')}`);
      console.log(`  Fin: ${scheduledSlot.end.toLocaleString('fr-FR')}`);
      const duration = (scheduledSlot.end - scheduledSlot.start) / (1000 * 60);
      console.log(`  Durée: ${duration} minutes`);
    } else {
      console.log(`\n❌ Aucun créneau disponible pour cette tâche`);
    }

    // Test 3: Vérifier les règles d'espacement
    console.log('\n\n📏 Test 3: Vérification des règles d\'espacement\n');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const events = await googleCalendar.getEvents(
      config.calendars.jeremy,
      tomorrow,
      new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)
    );

    console.log(`Événements demain: ${events.length}`);

    if (events.length >= 2) {
      events.sort((a, b) => {
        const aStart = new Date(a.start.dateTime || a.start.date);
        const bStart = new Date(b.start.dateTime || b.start.date);
        return aStart - bStart;
      });

      for (let i = 0; i < events.length - 1; i++) {
        const current = events[i];
        const next = events[i + 1];

        const currentEnd = new Date(current.end.dateTime || current.end.date);
        const nextStart = new Date(next.start.dateTime || next.start.date);

        const gap = (nextStart - currentEnd) / (1000 * 60); // en minutes

        console.log(`\n  ${current.summary} → ${next.summary}`);
        console.log(`  Gap: ${gap} minutes ${gap >= 15 ? '✅' : '⚠️  (< 15 min)'}`);
      }
    } else {
      console.log('  Pas assez d\'événements pour tester l\'espacement');
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Tests terminés avec succès\n');

  } catch (error) {
    console.error('\n❌ Erreur lors des tests:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Exécuter les tests
testSchedulingRules()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Erreur fatale:', error);
    process.exit(1);
  });

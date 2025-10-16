#!/usr/bin/env node

/**
 * 🔍 ANALYSE DE CHARGE - Orchestration Quotidienne
 *
 * Calcule les volumes d'appels API pour détecter les risques de surcharge
 */

console.log('🔍 ANALYSE DE CHARGE - Orchestration Quotidienne\n');
console.log('═'.repeat(60));

// ═══════════════════════════════════════════════════════════
// DONNÉES RÉELLES DU SYSTÈME
// ═══════════════════════════════════════════════════════════

const INBOX_TASKS = 93; // Tâches actuelles dans Inbox
const TOTAL_TASKS = 250; // Total tâches système
const BATCH_SIZE = 10; // Taille batch Inbox cleanup

// ═══════════════════════════════════════════════════════════
// RATE LIMITS TICKTICK
// ═══════════════════════════════════════════════════════════

const TICKTICK_LIMIT_1MIN = 100;
const TICKTICK_LIMIT_5MIN = 300;
const TICKTICK_SAFETY_1MIN = 80; // Seuil sécurité
const TICKTICK_SAFETY_5MIN = 250; // Seuil sécurité

// ═══════════════════════════════════════════════════════════
// RATE LIMITS LLM
// ═══════════════════════════════════════════════════════════

const GROQ_RPM = 30; // Requests per minute (gratuit)
const GROQ_RPD = 14400; // Requests per day (gratuit)
const GEMINI_RPM = 15; // Requests per minute (gratuit)
const GEMINI_RPD = 1500; // Requests per day (gratuit)

// ═══════════════════════════════════════════════════════════
// CALCUL ÉTAPE 1: NETTOYAGE INBOX
// ═══════════════════════════════════════════════════════════

console.log('\n📥 ÉTAPE 1: NETTOYAGE INBOX\n');

const inboxBatches = Math.ceil(INBOX_TASKS / BATCH_SIZE);
const llmCallsInbox = inboxBatches; // 1 appel LLM par batch
const ticktickCallsInbox = INBOX_TASKS; // 1 update par tâche

console.log(`Tâches Inbox:           ${INBOX_TASKS}`);
console.log(`Taille batch:           ${BATCH_SIZE}`);
console.log(`Nombre de batches:      ${inboxBatches}`);
console.log(`\nAppels LLM:             ${llmCallsInbox}`);
console.log(`Appels TickTick:        ${ticktickCallsInbox}`);

// Durée estimée
const avgBatchDuration = 8; // secondes par batch (estimation)
const inboxDuration = inboxBatches * avgBatchDuration;

console.log(`\nDurée estimée:          ${inboxDuration}s (${Math.round(inboxDuration/60)}min)`);

// ═══════════════════════════════════════════════════════════
// CALCUL ÉTAPE 2: RÉÉQUILIBRAGE 60 JOURS
// ═══════════════════════════════════════════════════════════

console.log('\n🔄 ÉTAPE 2: RÉÉQUILIBRAGE 60 JOURS\n');

const ticktickCallsSync = 2; // 1 getProjects + 1 getTasks
const rescheduledTasks = 15; // Estimation moyenne (variable)
const ticktickCallsReschedule = rescheduledTasks;
const ticktickCallsRebalance = ticktickCallsSync + ticktickCallsReschedule;

console.log(`Appels sync (get):      ${ticktickCallsSync}`);
console.log(`Tâches replanifiées:    ${rescheduledTasks} (estimation)`);
console.log(`Appels reschedule:      ${ticktickCallsReschedule}`);
console.log(`Total appels TickTick:  ${ticktickCallsRebalance}`);

const rebalanceDuration = 20; // secondes (estimation)
console.log(`\nDurée estimée:          ${rebalanceDuration}s`);

// ═══════════════════════════════════════════════════════════
// TOTAUX ORCHESTRATION COMPLÈTE
// ═══════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log('📊 TOTAUX ORCHESTRATION COMPLÈTE\n');

const totalLLMCalls = llmCallsInbox;
const totalTickTickCalls = ticktickCallsInbox + ticktickCallsRebalance;
const totalDuration = inboxDuration + rebalanceDuration;

console.log(`Appels LLM:             ${totalLLMCalls}`);
console.log(`Appels TickTick:        ${totalTickTickCalls}`);
console.log(`Durée totale:           ${totalDuration}s (${Math.round(totalDuration/60)}min)`);

// ═══════════════════════════════════════════════════════════
// ANALYSE RATE LIMITS TICKTICK
// ═══════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log('⚠️  ANALYSE RATE LIMITS TICKTICK\n');

const ticktickCallsPer1Min = totalTickTickCalls / (totalDuration / 60);
const ticktickUsage1Min = (ticktickCallsPer1Min / TICKTICK_LIMIT_1MIN) * 100;
const ticktickSafetyMargin1Min = TICKTICK_SAFETY_1MIN - ticktickCallsPer1Min;

console.log(`Limite officielle:      ${TICKTICK_LIMIT_1MIN} req/min`);
console.log(`Seuil sécurité:         ${TICKTICK_SAFETY_1MIN} req/min`);
console.log(`Utilisation prévue:     ${Math.round(ticktickCallsPer1Min)} req/min (${ticktickUsage1Min.toFixed(1)}%)`);
console.log(`Marge sécurité:         ${Math.round(ticktickSafetyMargin1Min)} req/min`);

if (ticktickCallsPer1Min > TICKTICK_SAFETY_1MIN) {
  console.log(`\n❌ RISQUE: Dépassement seuil sécurité!`);
  console.log(`   Le throttle va ralentir les requêtes automatiquement.`);
} else if (ticktickCallsPer1Min > TICKTICK_LIMIT_1MIN * 0.7) {
  console.log(`\n⚠️  ATTENTION: Utilisation élevée (>70%)`);
} else {
  console.log(`\n✅ OK: Marge confortable`);
}

// 5 minutes
const ticktickUsage5Min = (totalTickTickCalls / TICKTICK_LIMIT_5MIN) * 100;
console.log(`\nLimite 5min:            ${TICKTICK_LIMIT_5MIN} req/5min`);
console.log(`Utilisation prévue:     ${totalTickTickCalls} req/${Math.round(totalDuration/60)}min (${ticktickUsage5Min.toFixed(1)}%)`);

if (totalTickTickCalls > TICKTICK_SAFETY_5MIN) {
  console.log(`❌ RISQUE: Dépassement seuil sécurité 5min!`);
} else if (totalTickTickCalls > TICKTICK_LIMIT_5MIN * 0.7) {
  console.log(`⚠️  ATTENTION: Utilisation élevée 5min (>70%)`);
} else {
  console.log(`✅ OK: Marge confortable 5min`);
}

// ═══════════════════════════════════════════════════════════
// ANALYSE RATE LIMITS LLM
// ═══════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log('🤖 ANALYSE RATE LIMITS LLM\n');

console.log('GROQ (prioritaire):');
console.log(`  Limite:               ${GROQ_RPM} req/min, ${GROQ_RPD} req/jour`);
console.log(`  Utilisation prévue:   ${totalLLMCalls} req/${Math.round(totalDuration/60)}min`);
const groqUsageRPM = (totalLLMCalls / (totalDuration / 60) / GROQ_RPM) * 100;
console.log(`  Taux utilisation:     ${groqUsageRPM.toFixed(1)}% RPM`);

if (totalLLMCalls / (totalDuration / 60) > GROQ_RPM) {
  console.log(`  ⚠️  RISQUE: Peut déclencher rate limit GROQ`);
  console.log(`     → Fallback automatique sur Gemini`);
} else {
  console.log(`  ✅ OK: Dans les limites GROQ`);
}

console.log(`\nGemini (fallback):`);
console.log(`  Limite:               ${GEMINI_RPM} req/min, ${GEMINI_RPD} req/jour`);
console.log(`  Utilisation si fallback: ${totalLLMCalls} req`);
const geminiUsageRPM = (totalLLMCalls / (totalDuration / 60) / GEMINI_RPM) * 100;
console.log(`  Taux utilisation:     ${geminiUsageRPM.toFixed(1)}% RPM`);

if (totalLLMCalls / (totalDuration / 60) > GEMINI_RPM) {
  console.log(`  ❌ RISQUE ÉLEVÉ: Dépassement Gemini RPM!`);
  console.log(`     → Certains batches peuvent échouer`);
} else {
  console.log(`  ✅ OK: Dans les limites Gemini`);
}

// ═══════════════════════════════════════════════════════════
// SCÉNARIOS PESSIMISTES
// ═══════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log('💥 SCÉNARIOS PESSIMISTES\n');

console.log('Scénario 1: Inbox remplie (200 tâches)');
const pessimistBatches = Math.ceil(200 / BATCH_SIZE);
const pessimistLLM = pessimistBatches;
const pessimistTickTick = 200 + ticktickCallsRebalance;
const pessimistDuration = pessimistBatches * avgBatchDuration + rebalanceDuration;
console.log(`  LLM:       ${pessimistLLM} appels`);
console.log(`  TickTick:  ${pessimistTickTick} appels`);
console.log(`  Durée:     ${pessimistDuration}s (${Math.round(pessimistDuration/60)}min)`);
console.log(`  TickTick/min: ${Math.round(pessimistTickTick / (pessimistDuration/60))} req/min`);

if (pessimistTickTick / (pessimistDuration/60) > TICKTICK_SAFETY_1MIN) {
  console.log(`  ❌ RISQUE: Throttle actif (ralentissement automatique)`);
} else {
  console.log(`  ⚠️  ATTENTION: Proche des limites`);
}

console.log('\nScénario 2: Réorganisation massive (100 tâches déplacées)');
const massiveRescheduled = 100;
const massiveTickTick = ticktickCallsInbox + ticktickCallsSync + massiveRescheduled;
console.log(`  TickTick:  ${massiveTickTick} appels`);
console.log(`  TickTick/min: ${Math.round(massiveTickTick / (totalDuration/60))} req/min`);

if (massiveTickTick / (totalDuration/60) > TICKTICK_SAFETY_1MIN) {
  console.log(`  ❌ RISQUE: Throttle actif (ralentissement automatique)`);
} else {
  console.log(`  ✅ OK: Gérable`);
}

// ═══════════════════════════════════════════════════════════
// RECOMMANDATIONS
// ═══════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log('💡 RECOMMANDATIONS\n');

if (totalTickTickCalls / (totalDuration/60) > TICKTICK_SAFETY_1MIN * 0.8) {
  console.log('⚠️  TickTick:');
  console.log('   - Activer throttle (DÉJÀ EN PLACE ✅)');
  console.log('   - Augmenter délai entre batches');
  console.log('   - Réduire taille batch (10 → 5)');
  console.log('');
}

if (totalLLMCalls / (totalDuration/60) > GROQ_RPM * 0.8) {
  console.log('⚠️  LLM:');
  console.log('   - Ajouter délai entre batches (ex: 2s)');
  console.log('   - Réduire taille batch (10 → 5)');
  console.log('   - Implémenter retry avec backoff');
  console.log('');
}

if (totalTickTickCalls < TICKTICK_SAFETY_1MIN && totalLLMCalls / (totalDuration/60) < GROQ_RPM) {
  console.log('✅ SYSTÈME OPTIMAL:');
  console.log('   - Toutes les limites sont respectées');
  console.log('   - Marges de sécurité confortables');
  console.log('   - Throttle en place pour cas exceptionnels');
  console.log('');
}

console.log('🔒 PROTECTIONS EXISTANTES:');
console.log('   ✅ Throttle TickTick automatique (waitForRateLimit)');
console.log('   ✅ Fallback GROQ → Gemini');
console.log('   ✅ Cache 2min pour éviter duplicatas');
console.log('   ✅ Batch processing (10 tâches/batch)');
console.log('   ✅ Retry automatique sur échecs');

console.log('\n' + '═'.repeat(60));

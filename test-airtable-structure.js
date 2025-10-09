const AirtableAPI = require('./src/api/airtable-api');
const logger = require('./src/utils/logger');

async function testAirtableStructure() {
  const airtable = new AirtableAPI();

  console.log('🔍 Initialisation Airtable...');
  await airtable.initialize();

  console.log('\n📋 Récupération des enregistrements...');
  const records = await airtable.getProspects('tbl6NXwfDg7ZtYE7a', { maxRecords: 5 });

  console.log(`\n✅ ${records.length} enregistrements récupérés\n`);

  // Afficher la structure des champs
  if (records.length > 0) {
    console.log('📊 STRUCTURE DES CHAMPS DÉTECTÉS:\n');

    const firstRecord = records[0];
    const fieldNames = Object.keys(firstRecord.fields);

    console.log(`Champs disponibles (${fieldNames.length}):`);
    fieldNames.forEach((field, index) => {
      const value = firstRecord.fields[field];
      const type = Array.isArray(value) ? 'Array' : typeof value;
      console.log(`  ${index + 1}. "${field}" (${type})`);

      // Afficher un exemple de valeur
      if (type === 'Array') {
        console.log(`     Exemple: [${value.slice(0, 2).join(', ')}...]`);
      } else if (typeof value === 'string' && value.length > 50) {
        console.log(`     Exemple: "${value.substring(0, 50)}..."`);
      } else {
        console.log(`     Exemple: "${value}"`);
      }
    });

    console.log('\n📝 EXEMPLE COMPLET (1er enregistrement):\n');
    console.log(JSON.stringify(firstRecord, null, 2));
  }
}

testAirtableStructure().catch(error => {
  console.error('❌ Erreur:', error.message);
  process.exit(1);
});

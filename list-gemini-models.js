const { GoogleGenerativeAI } = require('@google/generative-ai');

(async () => {
  try {
    const apiKey = 'AIzaSyCExgp_PAPqDxyCQy70COil_X2qJuN6ZcU';
    const genAI = new GoogleGenerativeAI(apiKey);

    console.log('\n🔍 Liste des modèles Gemini disponibles:\n');

    // Try to list models
    const models = await genAI.listModels();

    console.log('Modèles disponibles:');
    for (const model of models) {
      console.log(`  - ${model.name}`);
      console.log(`    supportedGenerationMethods: ${model.supportedGenerationMethods?.join(', ')}`);
    }

  } catch (error) {
    console.error('Erreur:', error.message);

    // If listing fails, try known model names
    console.log('\n🧪 Test modèles courants:\n');

    const testModels = [
      'gemini-pro',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'models/gemini-pro',
      'models/gemini-1.5-pro'
    ];

    const genAI = new GoogleGenerativeAI(apiKey);

    for (const modelName of testModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent('Test');
        console.log(`✅ ${modelName} - FONCTIONNE`);
        break;
      } catch (err) {
        console.log(`❌ ${modelName} - ${err.message.split('\n')[0]}`);
      }
    }
  }
})();

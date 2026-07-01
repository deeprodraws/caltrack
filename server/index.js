require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const entriesRouter = require('./routes/entries');
const goalsRouter = require('./routes/goals');
const savedFoodsRouter = require('./routes/savedFoods');
const scanFoodRouter = require('./routes/scanFood');
const weightLogsRouter = require('./routes/weightLogs');
const mealTemplatesRouter = require('./routes/mealTemplates');
const recipesRouter = require('./routes/recipes');
const ingredientMemoryRouter = require('./routes/ingredientMemory');
const metricsRouter = require('./routes/metrics');
const exercisesRouter = require('./routes/exercises');
const workoutTemplatesRouter = require('./routes/workoutTemplates');
const workoutSessionsRouter = require('./routes/workoutSessions');
const sessionSets = require('./routes/sessionSets');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/entries', entriesRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/saved-foods', savedFoodsRouter);
app.use('/api/scan-food', scanFoodRouter);
app.use('/api/weight', weightLogsRouter);
app.use('/api/meal-templates', mealTemplatesRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api/ingredient-memory', ingredientMemoryRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/exercises', exercisesRouter);
app.use('/api/workout-templates', workoutTemplatesRouter);
app.use('/api/workout-sessions', workoutSessionsRouter);
app.use('/api/session-exercises', sessionSets);
app.use('/api/sets', sessionSets.setsRouter);

// Serve the built React app (production mode)
const distPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // All non-API routes hand off to React Router
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`CalTrack running on http://localhost:${PORT}`);
});

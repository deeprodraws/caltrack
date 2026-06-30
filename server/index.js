require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const entriesRouter = require('./routes/entries');
const goalsRouter = require('./routes/goals');
const savedFoodsRouter = require('./routes/savedFoods');
const scanFoodRouter = require('./routes/scanFood');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/entries', entriesRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/saved-foods', savedFoodsRouter);
app.use('/api/scan-food', scanFoodRouter);

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

const express = require('express');
const path = require('path');
const app = express();

// API routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve static files from the dist folder
app.use(express.static(path.join(__dirname, '../dist')));

// For all other routes, serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
const express = require('express');
const path = require('path');
const app = express();

// Middleware
app.use(express.json());

// API routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve static files from dist folder
// Use process.cwd() to get repo root on Render
const distPath = path.join(process.cwd(), 'dist');
console.log('Serving static files from:', distPath);

app.use(express.static(distPath));

// For all other routes, serve index.html (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
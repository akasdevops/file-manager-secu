require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();

// Middlewares globaux
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes API
app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/files', require('./src/routes/files.routes'));
app.use('/api/admin', require('./src/routes/admin.routes'));
app.use('/api/user', require('./src/routes/user.routes'));

// Redirection SPA pour index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur CloudSpace lancé sur http://localhost:${PORT}`);
});
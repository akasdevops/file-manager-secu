require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');

const app = express();

// 🛡️ Vérification stricte du secret JWT en production
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16)) {
    console.error('❌ JWT_SECRET manquant ou trop court en production. Arrêt du serveur.');
    process.exit(1);
}

app.disable('x-powered-by');

// 🛡️ En-têtes de sécurité de base (équivalent léger de Helmet)
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Middlewares globaux
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../public'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// 🛡️ Rate limiting simple en mémoire pour les routes d'authentification
const loginAttempts = new Map();
function rateLimitAuth(req, res, next) {
    const key = req.ip || req.socket.remoteAddress;
    const now = Date.now();
    const windowMs = 10 * 60 * 1000; // 10 minutes
    const max = 10; // 10 tentatives max par fenêtre

    const entry = loginAttempts.get(key) || { count: 0, resetAt: now + windowMs };
    if (entry.resetAt < now) {
        entry.count = 0;
        entry.resetAt = now + windowMs;
    }
    entry.count++;
    loginAttempts.set(key, entry);

    if (entry.count > max) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
    }
    next();
}

// Routes API
app.use('/api/auth', rateLimitAuth, require('./routes/auth.routes'));
app.use('/api/files', require('./routes/files.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/user', require('./routes/user.routes'));

// 404 JSON pour toute route API inconnue
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Route API introuvable.' });
});

// Handler d'erreurs (multer, JSON invalide, etc.)
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        const msg = err.code === 'LIMIT_FILE_SIZE'
            ? 'Fichier trop volumineux.'
            : err.code === 'LIMIT_FILE_COUNT'
                ? 'Trop de fichiers envoyés.'
                : `Erreur de téléversement : ${err.message}`;
        return res.status(400).json({ error: msg });
    }
    // Erreurs body-parser (JSON invalide, corps trop gros)
    if (err.type && err.statusCode) {
        return res.status(err.statusCode === 413 ? 413 : 400).json({ error: err.type === 'entity.too.large' ? 'Requête trop volumineuse.' : 'Requête invalide.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
});

// Redirection SPA pour index.html (hors routes API)
app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Serveur CloudSpace lancé sur http://localhost:${PORT}`);
});

const jwt = require('jsonwebtoken');

module.exports = function authMiddleware(req, res, next) {
    // 🔒 Le token est fourni UNIQUEMENT via l'en-tête Authorization (jamais dans l'URL)
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: 'Accès non autorisé : Token manquant.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Token invalide ou expiré.' });
    }
};

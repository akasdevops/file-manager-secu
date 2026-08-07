const jwt = require('jsonwebtoken');

module.exports = function authMiddleware(req, res, next) {
    let token = req.headers.authorization?.split(' ')[1] || req.query.token;

    if (!token) {
        return res.status(401).json({ error: 'Accès non autorisé : Token manquant.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_fallback');
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Token invalide ou expiré.' });
    }
};
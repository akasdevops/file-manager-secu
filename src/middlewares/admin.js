module.exports = function adminMiddleware(req, res, next) {
    if (req.user && req.user.role === 'ADMIN') {
        next();
    } else {
        return res.status(403).json({ error: 'Accès refusé : Droits d\'administrateur requis.' });
    }
};
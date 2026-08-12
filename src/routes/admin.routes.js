const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const admin = require('../middlewares/admin');
const { readData, saveData } = require('../config/database');

router.use(auth, admin);

const ALLOWED_STATUSES = ['APPROVED', 'PENDING', 'DISABLED'];
const ALLOWED_SETTINGS = ['allowPublicRegister', 'requireAdminApproval'];

// Paramètres
router.get('/settings', (req, res) => res.json(readData().settings));
router.post('/settings', (req, res) => {
    const db = readData();
    // 🛡️ On ne met à jour que les clés connues
    for (const key of ALLOWED_SETTINGS) {
        if (typeof req.body[key] === 'boolean') {
            db.settings[key] = req.body[key];
        }
    }
    saveData(db);
    res.json({ message: 'Paramètres mis à jour.' });
});

// Gestion Utilisateurs
router.get('/users', (req, res) => {
    const db = readData();
    res.json(db.users.map(({ password, ...u }) => u));
});

router.put('/users/:id/status', (req, res) => {
    const db = readData();
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    const newStatus = req.body.status;
    if (!ALLOWED_STATUSES.includes(newStatus)) {
        return res.status(400).json({ error: 'Statut invalide.' });
    }

    // 🛡️ Un administrateur ne peut pas se désactiver lui-même
    if (user.id === req.user.id && newStatus !== 'APPROVED') {
        return res.status(400).json({ error: 'Impossible de modifier son propre statut.' });
    }

    // 🛡️ Impossible de désactiver le dernier administrateur actif
    const activeAdmins = db.users.filter(u => u.role === 'ADMIN' && u.status === 'APPROVED');
    if (user.role === 'ADMIN' && user.status === 'APPROVED' && newStatus !== 'APPROVED' && activeAdmins.length <= 1) {
        return res.status(400).json({ error: 'Impossible de désactiver le dernier administrateur.' });
    }

    user.status = newStatus;
    saveData(db);
    res.json({ message: 'Statut mis à jour.' });
});

router.delete('/users/:id', (req, res) => {
    const db = readData();
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    // 🛡️ Un administrateur ne peut pas se supprimer lui-même
    if (user.id === req.user.id) {
        return res.status(400).json({ error: 'Impossible de supprimer son propre compte.' });
    }

    // 🛡️ Impossible de supprimer le dernier administrateur actif
    const activeAdmins = db.users.filter(u => u.role === 'ADMIN' && u.status === 'APPROVED');
    if (user.role === 'ADMIN' && user.status === 'APPROVED' && activeAdmins.length <= 1) {
        return res.status(400).json({ error: 'Impossible de supprimer le dernier administrateur.' });
    }

    db.users = db.users.filter(u => u.id !== req.params.id);
    saveData(db);
    res.json({ message: 'Utilisateur supprimé.' });
});

module.exports = router;

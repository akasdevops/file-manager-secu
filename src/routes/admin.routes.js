const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const admin = require('../middlewares/admin');
const { readData, saveData } = require('../config/database');

router.use(auth, admin);

// Paramètres
router.get('/settings', (req, res) => res.json(readData().settings));
router.post('/settings', (req, res) => {
    const db = readData();
    db.settings = { ...db.settings, ...req.body };
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
    const u = db.users.find(u => u.id === req.params.id);
    if (u) u.status = req.body.status;
    saveData(db);
    res.json({ message: 'Statut mis à jour.' });
});

router.delete('/users/:id', (req, res) => {
    let db = readData();
    db.users = db.users.filter(u => u.id !== req.params.id);
    saveData(db);
    res.json({ message: 'Utilisateur supprimé.' });
});

module.exports = router;
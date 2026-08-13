const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const auth = require('../middlewares/auth');
const admin = require('../middlewares/admin');
const { readData, saveData } = require('../config/database');

router.use(auth, admin);

const ALLOWED_STATUSES = ['APPROVED', 'PENDING', 'DISABLED'];
const ALLOWED_SETTINGS = ['allowPublicRegister', 'requireAdminApproval'];
const ALLOWED_ROLES = ['USER', 'ADMIN'];
const ALLOWED_PERMISSIONS = ['canManageDirs'];

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

// Créer un utilisateur (directement approuvé, rôle et quota au choix)
router.post('/users', async (req, res) => {
    const { username, password, role, quotaMB, canManageDirs } = req.body;

    if (!username || !password) return res.status(400).json({ error: 'Identifiants incomplets.' });

    const cleanUsername = String(username).trim();
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(cleanUsername)) {
        return res.status(400).json({ error: 'Nom d\'utilisateur invalide (3 à 32 caractères : lettres, chiffres, _ . -).' });
    }
    if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
    }

    const newRole = ALLOWED_ROLES.includes(role) ? role : 'USER';
    let newQuota = parseInt(quotaMB, 10);
    if (!Number.isInteger(newQuota) || newQuota <= 0) {
        newQuota = 500;
    }
    const newCanManageDirs = typeof canManageDirs === 'boolean' ? canManageDirs : false;

    const db = readData();
    if (db.users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
        return res.status(400).json({ error: 'Cet utilisateur existe déjà.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        id: Date.now().toString(),
        username: cleanUsername,
        password: hashedPassword,
        role: newRole,
        status: 'APPROVED',
        quotaMB: newQuota,
        canManageDirs: newCanManageDirs
    };

    db.users.push(newUser);
    saveData(db);

    res.json({ message: 'Utilisateur créé avec succès.' });
});

// 🔒 Droits de gestion des dossiers (renommer/supprimer) accordés par l'administrateur
router.put('/users/:id/permissions', (req, res) => {
    const db = readData();
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    const perm = req.body;
    for (const key of ALLOWED_PERMISSIONS) {
        if (typeof perm[key] === 'boolean') {
            user[key] = perm[key];
        }
    }

    saveData(db);
    res.json({ message: 'Droits mis à jour.' });
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

// Réinitialiser le mot de passe d'un utilisateur
router.put('/users/:id/password', async (req, res) => {
    const db = readData();
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    const newPassword = req.body.password;
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    saveData(db);
    res.json({ message: 'Mot de passe réinitialisé avec succès.' });
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

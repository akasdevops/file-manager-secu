const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { readData, saveData } = require('../config/database');

// Inscription
router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Identifiants incomplets.' });

    // 🛡️ Validation du nom d'utilisateur
    const cleanUsername = String(username).trim();
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(cleanUsername)) {
        return res.status(400).json({ error: 'Nom d\'utilisateur invalide (3 à 32 caractères : lettres, chiffres, _ . -).' });
    }
    // 🛡️ Validation du mot de passe (minimum 8 caractères)
    if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
    }

    const db = readData();
    if (!db.settings.allowPublicRegister) {
        return res.status(403).json({ error: 'Les inscriptions sont actuellement fermées.' });
    }

    if (db.users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
        return res.status(400).json({ error: 'Cet utilisateur existe déjà.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const isFirstUser = db.users.length === 0;

    const newUser = {
        id: Date.now().toString(),
        username: cleanUsername,
        password: hashedPassword,
        role: isFirstUser ? 'ADMIN' : 'USER',
        status: (isFirstUser || !db.settings.requireAdminApproval) ? 'APPROVED' : 'PENDING',
        quotaMB: 500
    };

    db.users.push(newUser);
    saveData(db);

    // Créer le dossier racine de l'utilisateur
    //fs.mkdirSync(path.join(__dirname, '../../uploads', username), { recursive: true });

    const msg = newUser.status === 'PENDING'
        ? 'Compte créé. En attente d\'approbation par l\'administrateur.'
        : 'Compte créé avec succès !';

    res.json({ message: msg });
});

// Connexion
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const db = readData();

    const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) return res.status(400).json({ error: 'Identifiant ou mot de passe incorrect.' });

    if (user.status !== 'APPROVED') {
        return res.status(403).json({ error: 'Votre compte est en attente d\'approbation ou désactivé.' });
    }

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ error: 'Identifiant ou mot de passe incorrect.' });

    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
    );

    res.json({
        token,
        user: { id: user.id, username: user.username, role: user.role }
    });
});

module.exports = router;
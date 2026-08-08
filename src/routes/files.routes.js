const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const auth = require('../middlewares/auth');
const upload = require('../utils/storage');
const { readData } = require('../config/database');

// Calculer l'espace mémoire utilisé
function getFolderSize(dir) {
    if (!fs.existsSync(dir)) return 0;
    let total = 0;
    for (const file of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        total += stat.isDirectory() ? getFolderSize(fullPath) : stat.size;
    }
    return total;
}

// Lister les fichiers
router.get('/browse', auth, (req, res) => {
    const relPath = req.query.path || '';
    const userDir = path.join(__dirname, '../../uploads', req.user.username);
    const targetDir = path.join(userDir, relPath);

    if (!targetDir.startsWith(userDir) || !fs.existsSync(targetDir)) {
        return res.status(400).json({ error: 'Dossier introuvable.' });
    }

    const items = fs.readdirSync(targetDir).map(name => {
        const stat = fs.statSync(path.join(targetDir, name));
        return { name, size: stat.size, isDirectory: stat.isDirectory() };
    });

    const db = readData();
    const userData = db.users.find(u => u.id === req.user.id);

    res.json({
        items,
        parentPath: relPath ? path.dirname(relPath) === '.' ? '' : path.dirname(relPath) : null,
        usedBytes: getFolderSize(userDir),
        quotaBytes: (userData?.quotaMB || 500) * 1024 * 1024
    });
});

// Téléverser
router.post('/upload', auth, upload.array('files'), (req, res) => {
    res.json({ message: 'Fichiers envoyés avec succès !' });
});

// Créer un dossier
router.post('/folder', auth, (req, res) => {
    const { parentPath, folderName } = req.body;
    const target = path.join(__dirname, '../../uploads', req.user.username, parentPath || '', folderName);
    fs.mkdirSync(target, { recursive: true });
    res.json({ message: 'Dossier créé.' });
});

// Télécharger / Prévisualiser
router.get('/download', auth, (req, res) => {
    const filePath = req.query.filePath;
    const fullPath = path.join(__dirname, '../../uploads', req.user.username, filePath);

    if (!fs.existsSync(fullPath)) return res.status(404).send('Fichier introuvable.');

    if (req.query.preview === 'true') {
        return res.sendFile(fullPath);
    }
    res.download(fullPath);
});

// Supprimer
router.delete('/', auth, (req, res) => {
    const { itemPath } = req.body;
    const fullPath = path.join(__dirname, '../../uploads', req.user.username, itemPath);

    if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath, { recursive: true, force: true });
    }
    res.json({ message: 'Élément supprimé.' });
});

module.exports = router;
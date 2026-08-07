const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const auth = require('../middlewares/auth');
const upload = require('../utils/storage');
const { readData } = require('../config/database');

// Dossier Racine = Le point de montage du NAS
const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

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

// 1. Lister les fichiers
router.get('/browse', auth, (req, res) => {
    const relPath = req.query.path || '';
    // 🎯 On pointe directement sur UPLOADS_ROOT
    const targetDir = path.join(UPLOADS_ROOT, relPath);

    if (!targetDir.startsWith(UPLOADS_ROOT) || !fs.existsSync(targetDir)) {
        return res.status(400).json({ error: 'Dossier introuvable.' });
    }
    // 🛡️ Liste des fichiers système/sensibles à masquer absolument
    const HIDDEN_FILES = ['users.json', '.DS_Store', 'thumbs.db'];

    const items = fs.readdirSync(targetDir)
        // 🛡️ Filtre : On retire users.json de la liste
        .filter(name => !HIDDEN_FILES.includes(name.toLowerCase()))
        .map(name => {
            const stat = fs.statSync(path.join(targetDir, name));
            return { name, size: stat.size, isDirectory: stat.isDirectory() };
        });

    const db = readData();
    const userData = db.users.find(u => u.id === req.user.id);

    res.json({
        items,
        parentPath: relPath ? (path.dirname(relPath) === '.' ? '' : path.dirname(relPath)) : null,
        usedBytes: getFolderSize(UPLOADS_ROOT),
        quotaBytes: (userData?.quotaMB || 500) * 1024 * 1024
    });
});

// 2. Téléverser
router.post('/upload', auth, upload.array('files'), (req, res) => {
    res.json({ message: 'Fichiers envoyés sur le NAS !' });
});

// 3. Créer un dossier
router.post('/folder', auth, (req, res) => {
    const { parentPath, folderName } = req.body;
    const target = path.join(UPLOADS_ROOT, parentPath || '', folderName);

    if (!target.startsWith(UPLOADS_ROOT)) {
        return res.status(400).json({ error: 'Chemin interdit.' });
    }

    fs.mkdirSync(target, { recursive: true });
    res.json({ message: 'Dossier créé.' });
});

// 4. Télécharger / Aperçu
router.get('/download', auth, (req, res) => {
    const filePath = req.query.filePath;
    const fullPath = path.join(UPLOADS_ROOT, filePath);

    // 🛡️ Bloquer si l'utilisateur tente d'accéder à users.json
    if (path.basename(fullPath).toLowerCase() === 'users.json') {
        return res.status(403).send('Accès interdit.');
    }

    if (!fullPath.startsWith(UPLOADS_ROOT) || !fs.existsSync(fullPath)) {
        return res.status(404).send('Fichier introuvable.');
    }

    if (req.query.preview === 'true') {
        return res.sendFile(fullPath);
    }
    res.download(fullPath);
});

// 5. Supprimer
router.delete('/', auth, (req, res) => {
    const { itemPath } = req.body;
    const fullPath = path.join(UPLOADS_ROOT, itemPath);

    if (fullPath.startsWith(UPLOADS_ROOT) && fs.existsSync(fullPath)) {
        fs.rmSync(fullPath, { recursive: true, force: true });
    }
    res.json({ message: 'Élément supprimé.' });
});

module.exports = router;
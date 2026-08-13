const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const auth = require('../middlewares/auth');
const upload = require('../utils/storage');
const { readData } = require('../config/database');

// Dossier Racine = Le point de montage du NAS
const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');

// 🛡️ Fichiers système/sensibles à masquer et bloquer absolument
const SENSITIVE_FILES = ['users.json', '.env', '.git', '.ds_store', 'thumbs.db', 'node_modules', 'dockerfile', 'docker-compose.yml'];

// 🛡️ Un nom est sensible s'il est listé, s'il commence par "users.json"
// (backups users.json.bak / .bak.1 / .tmp) ou s'il s'agit d'un fichier caché (.xxx)
function isSensitiveName(name) {
    const lower = name.toLowerCase();
    return SENSITIVE_FILES.includes(lower) || lower.startsWith('users.json') || name.startsWith('.');
}

function isInside(base, target) {
    const rel = path.relative(base, target);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function isSensitive(p) {
    const parts = p.split(path.sep);
    return parts.some(part => isSensitiveName(part));
}

// 🔎 Résout un chemin utilisateur en chemin absolu sûr (dans UPLOADS_ROOT)
function resolveSafe(userPath) {
    const clean = (userPath || '').replace(/^[/\\]+/, '').replace(/[/\\]+$/, '');
    const full = path.resolve(UPLOADS_ROOT, clean);
    return isInside(UPLOADS_ROOT, full) ? full : null;
}

function getFolderSize(dir) {
    if (!fs.existsSync(dir)) return 0;
    let total = 0;
    try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            try {
                const stat = fs.statSync(fullPath);
                total += stat.isDirectory() ? getFolderSize(fullPath) : stat.size;
            } catch (err) {
                // Ignore files or directories that cannot be accessed/read
            }
        }
    } catch (err) {
        // Ignore folder read errors (e.g. EACCES)
    }
    return total;
}

// 1. Lister les fichiers
router.get('/browse', auth, (req, res) => {
    const targetDir = resolveSafe(req.query.path || '');

    if (!targetDir || !fs.existsSync(targetDir)) {
        return res.status(400).json({ error: 'Dossier introuvable.' });
    }

    let items = [];
    try {
        items = fs.readdirSync(targetDir)
            // 🛡️ Filtre : on masque les fichiers sensibles
            .filter(name => !isSensitiveName(name))
            .map(name => {
                try {
                    const stat = fs.statSync(path.join(targetDir, name));
                    return { name, size: stat.size, isDirectory: stat.isDirectory() };
                } catch (err) {
                    return null; // Skip file if we can't read it
                }
            })
            .filter(item => item !== null);
    } catch (err) {
        return res.status(403).json({ error: 'Accès au dossier refusé.' });
    }

    const db = readData();
    const userData = db.users.find(u => u.id === req.user.id);

    res.json({
        items,
        parentPath: req.query.path ? (path.dirname(req.query.path) === '.' ? '' : path.dirname(req.query.path)) : null,
        usedBytes: getFolderSize(UPLOADS_ROOT),
        quotaBytes: (userData?.quotaMB || 500) * 1024 * 1024
    });
});

// 2. Recherche récursive dans toute l'arborescence
router.get('/search', auth, (req, res) => {
    const q = (req.query.q || '').trim().toLowerCase();
    if (!q) return res.json({ items: [] });

    const results = [];
    const MAX_RESULTS = 200;

    function walk(dir, rel) {
        if (results.length >= MAX_RESULTS) return;
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (err) {
            return;
        }
        for (const entry of entries) {
            if (results.length >= MAX_RESULTS) break;
            if (isSensitiveName(entry.name)) continue;

            if (entry.name.toLowerCase().includes(q)) {
                const itemPath = rel ? `${rel}/${entry.name}` : entry.name;
                let size = 0;
                if (!entry.isDirectory()) {
                    try { size = fs.statSync(path.join(dir, entry.name)).size; } catch (err) { }
                }
                results.push({ name: entry.name, size, isDirectory: entry.isDirectory(), path: itemPath });
            }

            if (entry.isDirectory()) {
                walk(path.join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name);
            }
        }
    }

    walk(UPLOADS_ROOT, '');
    res.json({ items: results });
});

// 3. Téléverser
router.post('/upload', auth, upload.array('files'), (req, res) => {
    res.json({ message: 'Fichiers envoyés sur le NAS !' });
});

// 3. Créer un dossier
router.post('/folder', auth, (req, res) => {
    const { parentPath, folderName } = req.body;
    if (!folderName || typeof folderName !== 'string') {
        return res.status(400).json({ error: 'Nom de dossier invalide.' });
    }
    const parentDir = resolveSafe(parentPath);
    if (!parentDir) {
        return res.status(400).json({ error: 'Chemin interdit.' });
    }

    const safeName = folderName.replace(/[/\\\0]/g, '_').replace(/^[.]+$/, '');
    const target = path.resolve(parentDir, safeName);

    if (!isInside(UPLOADS_ROOT, target)) {
        return res.status(400).json({ error: 'Chemin interdit.' });
    }

    try {
        fs.mkdirSync(target, { recursive: true });
        res.json({ message: 'Dossier créé.' });
    } catch (err) {
        res.status(500).json({ error: 'Impossible de créer le dossier (erreur de permission).' });
    }
});

// 4. Renommer un fichier ou un dossier
router.put('/rename', auth, (req, res) => {
    const { itemPath, newName } = req.body;
    if (!itemPath || !newName || typeof newName !== 'string') {
        return res.status(400).json({ error: 'Paramètres invalides.' });
    }

    const safeName = newName.replace(/[/\\\0]/g, '_').trim();
    if (!safeName || safeName === '.' || safeName === '..') {
        return res.status(400).json({ error: 'Nom invalide.' });
    }

    const oldFull = resolveSafe(itemPath);
    if (!oldFull || !fs.existsSync(oldFull)) {
        return res.status(404).json({ error: 'Élément introuvable.' });
    }
    if (oldFull === UPLOADS_ROOT) {
        return res.status(403).json({ error: 'Impossible de renommer la racine.' });
    }
    // 🛡️ Interdire de renommer en fichier sensible (users.json, .env, ...)
    if (isSensitiveName(safeName)) {
        return res.status(403).json({ error: 'Ce nom est interdit.' });
    }

    const newFull = path.resolve(path.dirname(oldFull), safeName);
    if (!isInside(UPLOADS_ROOT, newFull)) {
        return res.status(400).json({ error: 'Chemin interdit.' });
    }
    if (fs.existsSync(newFull)) {
        return res.status(400).json({ error: 'Un élément porte déjà ce nom.' });
    }

    try {
        fs.renameSync(oldFull, newFull);
        res.json({ message: 'Élément renommé.' });
    } catch (err) {
        res.status(500).json({ error: 'Impossible de renommer l\'élément (erreur de permission).' });
    }
});

// 5. Télécharger / Aperçu
router.get('/download', auth, (req, res) => {
    const fullPath = resolveSafe(req.query.filePath);

    if (!fullPath || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        return res.status(404).send('Fichier introuvable.');
    }

    // 🛡️ Bloquer les fichiers sensibles (users.json, .env, ...)
    if (isSensitive(fullPath)) {
        return res.status(403).send('Accès interdit.');
    }

    if (req.query.preview === 'true') {
        return res.sendFile(fullPath);
    }
    res.download(fullPath);
});

// 5. Supprimer
router.delete('/', auth, (req, res) => {
    const fullPath = resolveSafe(req.body?.itemPath);

    if (!fullPath) {
        return res.status(400).json({ error: 'Chemin interdit.' });
    }
    if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'Élément introuvable.' });
    }
    if (fullPath === UPLOADS_ROOT) {
        return res.status(403).json({ error: 'Impossible de supprimer la racine.' });
    }

    try {
        fs.rmSync(fullPath, { recursive: true, force: true });
        return res.json({ message: 'Élément supprimé.' });
    } catch (err) {
        return res.status(500).json({ error: 'Impossible de supprimer l\'élément (erreur de permission).' });
    }
});

module.exports = router;

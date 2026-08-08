require('dotenv').config();

const express = require('express');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sanitize = require('sanitize-filename');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_' + Date.now();

const UPLOAD_ROOT = path.resolve(__dirname, '../uploads');
const DB_FILE = path.resolve(__dirname, '../data/users.json');

if (!fsSync.existsSync(UPLOAD_ROOT)) fsSync.mkdirSync(UPLOAD_ROOT, { recursive: true });

async function initDB() {
    if (!fsSync.existsSync(DB_FILE)) {
        const adminUser = process.env.ADMIN_USERNAME || 'admin';
        const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
        const allowPublic = process.env.ALLOW_PUBLIC_REGISTER !== 'false';
        const requireApproval = process.env.REQUIRE_ADMIN_APPROVAL !== 'false';

        const hashedPassword = await bcrypt.hash(adminPass, 10);
        const initialData = {
            settings: { allowPublicRegister: allowPublic, requireAdminApproval: requireApproval, defaultQuotaMB: 100 },
            users: [{ id: '1', username: adminUser, password: hashedPassword, role: 'ADMIN', status: 'APPROVED', quotaMB: 5000, createdAt: new Date() }]
        };
        await fs.writeFile(DB_FILE, JSON.stringify(initialData, null, 2));
        console.log(`🔑 Compte Admin initialisé : ${adminUser}`);
    }
}
initDB();

async function getDB() { return JSON.parse(await fs.readFile(DB_FILE, 'utf8')); }
async function saveDB(db) { await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2)); }

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];
    if (!token && req.query.token) token = req.query.token;

    if (!token) return res.status(401).json({ error: "Session non valide." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Session expirée." });
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: "Accès refusé." });
    next();
}

function getUserDir(username) {
    const userDir = path.resolve(UPLOAD_ROOT, sanitize(username));
    if (!userDir.startsWith(UPLOAD_ROOT)) throw new Error('TRAVERSAL');
    if (!fsSync.existsSync(userDir)) fsSync.mkdirSync(userDir, { recursive: true });
    return userDir;
}

function resolveUserPath(username, relPath = '') {
    const base = getUserDir(username);
    const target = path.resolve(base, relPath.replace(/^(\/|\\)+/, ''));
    if (!target.startsWith(base)) throw new Error('TRAVERSAL');
    return target;
}

async function getDirectorySize(dirPath) {
    let totalSize = 0;
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (let entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) totalSize += await getDirectorySize(fullPath);
            else totalSize += (await fs.stat(fullPath)).size;
        }
    } catch (e) { }
    return totalSize;
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        try {
            const targetFolder = req.body.folderPath || '';
            const safePath = resolveUserPath(req.user.username, targetFolder);
            fsSync.mkdirSync(safePath, { recursive: true });
            cb(null, safePath);
        } catch (err) { cb(err, null); }
    },
    filename: (req, file, cb) => cb(null, sanitize(file.originalname))
});
const upload = multer({ storage });

// AUTH
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const db = await getDB();
        if (!db.settings.allowPublicRegister) return res.status(403).json({ error: "Inscriptions désactivées." });
        if (!username || !password || password.length < 6) return res.status(400).json({ error: "Pseudo/MDP invalides." });
        if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) return res.status(400).json({ error: "Ce pseudo existe déjà." });

        const hashedPassword = await bcrypt.hash(password, 10);
        const status = db.settings.requireAdminApproval ? 'PENDING' : 'APPROVED';

        db.users.push({ id: Date.now().toString(), username, password: hashedPassword, role: 'USER', status, quotaMB: db.settings.defaultQuotaMB, createdAt: new Date() });
        await saveDB(db);

        res.status(201).json({ message: status === 'PENDING' ? "En attente d'approbation par l'admin." : "Compte créé avec succès !" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const db = await getDB();
        const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());

        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: "Identifiants incorrects." });
        if (user.status === 'PENDING') return res.status(403).json({ error: "Compte en attente d'approbation." });
        if (user.status === 'DISABLED') return res.status(403).json({ error: "Compte désactivé." });

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role, quotaMB: user.quotaMB }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, user: { username: user.username, role: user.role, quotaMB: user.quotaMB } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/user/change-password', authenticateToken, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "Mot de passe trop court." });
        const db = await getDB();
        const user = db.users.find(u => u.id === req.user.id);
        if (!user || !(await bcrypt.compare(oldPassword, user.password))) return res.status(401).json({ error: "Ancien mot de passe incorrect." });

        user.password = await bcrypt.hash(newPassword, 10);
        await saveDB(db);
        res.json({ message: "Mot de passe mis à jour !" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ADMIN
app.get('/api/admin/settings', authenticateToken, requireAdmin, async (req, res) => res.json((await getDB()).settings));
app.post('/api/admin/settings', authenticateToken, requireAdmin, async (req, res) => {
    const db = await getDB();
    db.settings = { ...db.settings, ...req.body };
    await saveDB(db);
    res.json({ message: "Paramètres sauvegardés." });
});

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    const db = await getDB();
    const userList = await Promise.all(db.users.map(async u => ({
        id: u.id, username: u.username, role: u.role, status: u.status || 'APPROVED', quotaMB: u.quotaMB || 100,
        usedBytes: await getDirectorySize(getUserDir(u.username)), createdAt: u.createdAt
    })));
    res.json(userList);
});

app.put('/api/admin/users/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    const db = await getDB();
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: "Introuvable." });
    user.status = req.body.status;
    await saveDB(db);
    res.json({ message: "Statut mis à jour." });
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    const db = await getDB();
    const index = db.users.findIndex(u => u.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Introuvable." });
    const targetUser = db.users[index];
    if (targetUser.username.toLowerCase() === req.user.username.toLowerCase()) return res.status(400).json({ error: "Action impossible." });

    try { await fs.rm(getUserDir(targetUser.username), { recursive: true, force: true }); } catch (e) { }
    db.users.splice(index, 1);
    await saveDB(db);
    res.json({ message: "Utilisateur supprimé." });
});

// FICHIERS
app.get('/api/files/browse', authenticateToken, async (req, res) => {
    try {
        const relPath = req.query.path || '';
        const targetPath = resolveUserPath(req.user.username, relPath);
        const entries = await fs.readdir(targetPath, { withFileTypes: true });
        const usedBytes = await getDirectorySize(getUserDir(req.user.username));

        const items = await Promise.all(entries.map(async (entry) => {
            const full = path.join(targetPath, entry.name);
            let stats = {};
            try { stats = await fs.stat(full); } catch (e) { }
            return { name: entry.name, isDirectory: entry.isDirectory(), size: entry.isDirectory() ? 0 : (stats.size || 0), updatedAt: stats.mtime };
        }));

        res.json({
            currentPath: relPath,
            parentPath: relPath ? (path.dirname(relPath) === '.' ? '' : path.dirname(relPath)) : null,
            usedBytes,
            quotaBytes: (req.user.quotaMB || 100) * 1024 * 1024,
            items: items.sort((a, b) => b.isDirectory - a.isDirectory || a.name.localeCompare(b.name))
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/files/upload', authenticateToken, async (req, res, next) => {
    const usedBytes = await getDirectorySize(getUserDir(req.user.username));
    if (usedBytes >= (req.user.quotaMB || 100) * 1024 * 1024) return res.status(400).json({ error: "Quota dépassé." });
    next();
}, upload.array('files', 20), (req, res) => res.status(201).json({ message: "Envoyé !" }));

app.post('/api/files/folder', authenticateToken, async (req, res) => {
    try {
        const { parentPath = '', folderName } = req.body;
        if (!folderName) return res.status(400).json({ error: "Nom de dossier requis." });
        await fs.mkdir(resolveUserPath(req.user.username, path.join(parentPath, sanitize(folderName))), { recursive: true });
        res.status(201).json({ message: "Dossier créé !" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/files/download', authenticateToken, async (req, res) => {
    try {
        const { filePath, preview } = req.query;
        if (!filePath) return res.status(400).send("Chemin manquant");
        const target = resolveUserPath(req.user.username, filePath);
        if (preview === 'true') res.sendFile(target);
        else res.download(target, path.basename(target));
    } catch (err) { res.status(404).json({ error: "Fichier introuvable." }); }
});

app.delete('/api/files', authenticateToken, async (req, res) => {
    try {
        const { itemPath } = req.body;
        if (!itemPath) return res.status(400).json({ error: "Chemin requis." });
        const target = resolveUserPath(req.user.username, itemPath);
        if (target === getUserDir(req.user.username)) return res.status(403).json({ error: "Action interdite." });
        await fs.rm(target, { recursive: true, force: true });
        res.json({ message: "Supprimé !" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.use(express.static(path.join(__dirname, '../public')));
app.listen(PORT, () => console.log(`🚀 Serveur actif sur http://localhost:${PORT}`));
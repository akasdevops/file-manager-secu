const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 📂 On pointe vers un dossier de données dédié monté depuis le NAS
// Par exemple : /app/data/users.json ou direct sur le NAS
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'users.json');
const BACKUP_PATH = path.join(DATA_DIR, 'users.json.bak');
const BACKUP2_PATH = path.join(DATA_DIR, 'users.json.bak.1');

// 🔐 Clé de chiffrement : un secret dédié (DB_SECRET) ou à défaut JWT_SECRET.
// Elle ne doit JAMAIS se trouver sur le NAS (elle vit dans l'env / un Secret K8s).
function getKey() {
    const secret = process.env.DB_SECRET || process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('DB_SECRET ou JWT_SECRET manquant : impossible de chiffrer users.json.');
    }
    if (!process.env.DB_SECRET) {
        console.warn('⚠️ DB_SECRET absent, chiffrement basé sur JWT_SECRET. Ajoutez une clé DB_SECRET dédiée.');
    }
    return crypto.createHash('sha256').update(secret).digest();
}

// 🔒 Chiffrement AES-256-GCM (confidentialité + intégrité)
// Format fichier : base64( IV(12) + AuthTag(16) + ciphertext )
function encrypt(obj) {
    const key = getKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const plain = Buffer.from(JSON.stringify(obj), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

// 🔓 Déchiffrement + vérification d'intégrité (échoue si le fichier a été modifié sans la clé)
function decrypt(b64) {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 28) throw new Error('Fichier chiffré trop court.');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const key = getKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return JSON.parse(plain);
}

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    // 🔒 Droits restrictifs (best-effort sur SMB/NFS)
    try { fs.chmodSync(DATA_DIR, 0o700); } catch (err) { }
}

function safeChmod(file) {
    try { fs.chmodSync(file, 0o600); } catch (err) { }
}

// Tente de charger un fichier : format chiffré, sinon legacy (JSON en clair) qu'on migre.
// Retourne l'objet, ou null si le fichier est absent/illisible/altéré.
function tryLoad(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return null;

    // 1. Format chiffré
    try {
        return decrypt(raw);
    } catch (err) { }

    // 2. Legacy (JSON en clair) : on le chiffre une fois pour ne pas perdre les comptes
    try {
        const obj = JSON.parse(raw);
        if (obj && (obj.settings || obj.users)) {
            const tmp = DB_PATH + '.tmp';
            fs.writeFileSync(tmp, encrypt(obj));
            fs.renameSync(tmp, DB_PATH);
            safeChmod(DB_PATH);
            console.log('🔒 users.json migré vers le format chiffré.');
            return obj;
        }
    } catch (err) { }

    return null;
}

// Initialisation au démarrage
function initDatabase() {
    ensureDataDir();

    const main = tryLoad(DB_PATH);
    if (main) return;

    const bak = tryLoad(BACKUP_PATH);
    if (bak) {
        console.warn('⚠️ users.json absent/altéré, restauration depuis users.json.bak.');
        fs.copyFileSync(BACKUP_PATH, DB_PATH);
        safeChmod(DB_PATH);
        return;
    }

    const bak2 = tryLoad(BACKUP2_PATH);
    if (bak2) {
        console.warn('⚠️ users.json et .bak absents/altérés, restauration depuis users.json.bak.1.');
        fs.copyFileSync(BACKUP2_PATH, DB_PATH);
        safeChmod(DB_PATH);
        return;
    }

    if (!fs.existsSync(DB_PATH)) {
        const initialData = {
            settings: { allowPublicRegister: true, requireAdminApproval: false },
            users: []
        };
        saveData(initialData);
        console.log('📁 Nouveau users.json chiffré créé.');
        return;
    }

    // Fichier présent mais illisible ET backups invalides -> on ne détruit rien, on stoppe.
    console.error('❌ users.json illisible ou modifié (échec d\'intégrité). Vérifiez DB_SECRET/JWT_SECRET ou restaurez le backup.');
    process.exit(1);
}

function readData() {
    const obj = tryLoad(DB_PATH);
    if (obj) return obj;

    // 🔧 Auto-réparation à chaud depuis les backups (si suppression/altération pendant le runtime)
    const bak = tryLoad(BACKUP_PATH);
    if (bak) {
        console.warn('⚠️ users.json absent/altéré, restauration auto depuis users.json.bak.');
        fs.copyFileSync(BACKUP_PATH, DB_PATH);
        safeChmod(DB_PATH);
        return bak;
    }
    const bak2 = tryLoad(BACKUP2_PATH);
    if (bak2) {
        console.warn('⚠️ users.json et .bak absents/altérés, restauration auto depuis users.json.bak.1.');
        fs.copyFileSync(BACKUP2_PATH, DB_PATH);
        safeChmod(DB_PATH);
        return bak2;
    }

    throw new Error('Base de données users.json illisible ou modifiée.');
}

function saveData(data) {
    const encrypted = encrypt(data);

    // Rotation des backups (conservation des 2 derniers)
    const current = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
    if (current) {
        if (fs.existsSync(BACKUP_PATH)) {
            fs.copyFileSync(BACKUP_PATH, BACKUP2_PATH);
            safeChmod(BACKUP2_PATH);
        }
        fs.writeFileSync(BACKUP_PATH, current);
        safeChmod(BACKUP_PATH);
    }

    // Écriture atomique
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, encrypted);
    fs.renameSync(tmp, DB_PATH);
    safeChmod(DB_PATH);
}

initDatabase();

module.exports = { readData, saveData };

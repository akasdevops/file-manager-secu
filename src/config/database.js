const fs = require('fs');
const path = require('path');

// 📂 On pointe vers un dossier de données dédié monté depuis le NAS
// Par exemple : /app/data/users.json ou direct sur le NAS
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'users.json');

// S'assurer que le dossier data/ existe
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialisation au tout premier lancement si le fichier n'existe pas encore sur le NAS
if (!fs.existsSync(DB_PATH)) {
    const initialData = {
        settings: { allowPublicRegister: true, requireAdminApproval: false },
        users: []
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
    console.log('📁 Nouveau fichier users.json créé sur le volume NAS.');
}

function readData() {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw);
}

function saveData(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = { readData, saveData };
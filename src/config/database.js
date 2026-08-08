const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/users.json');

// S'assurer que users.json existe
if (!fs.existsSync(DB_PATH)) {
    const initialData = {
        settings: { allowPublicRegister: true, requireAdminApproval: false },
        users: []
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
}

function readData() {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw);
}

function saveData(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = { readData, saveData };
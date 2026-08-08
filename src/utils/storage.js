const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const userDir = path.join(__dirname, '../../uploads', req.user.username);
        const subPath = req.body.folderPath || '';
        const targetDir = path.join(userDir, subPath);

        // Sécurité anti-traversée de répertoire
        if (!targetDir.startsWith(userDir)) {
            return cb(new Error('Chemin invalide.'));
        }

        fs.mkdirSync(targetDir, { recursive: true });
        cb(null, targetDir);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

module.exports = multer({ storage });
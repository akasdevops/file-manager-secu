const multer = require('multer');
const path = require('path');
const fs = require('fs');

const baseUploadDir = path.resolve(__dirname, '../../uploads');

function isInside(base, target) {
    const rel = path.relative(base, target);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const subPath = (req.body.folderPath || '').replace(/^[/\\]+/, '').replace(/[/\\]+$/, '');
        let targetDir = path.resolve(baseUploadDir, subPath);

        // 🛡️ Sécurité anti-traversée de répertoire
        if (!isInside(baseUploadDir, targetDir)) {
            return cb(new Error('Chemin invalide.'));
        }

        try {
            fs.mkdirSync(targetDir, { recursive: true });
        } catch (mkdirErr) {
            return cb(mkdirErr);
        }
        cb(null, targetDir);
    },
    filename: (req, file, cb) => {
        // Remplace les caractères dangereux du nom de fichier
        const safeName = file.originalname.replace(/[/\\\0]/g, '_');
        cb(null, safeName);
    }
});

module.exports = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024 * 1024, // 5 Go par fichier
        files: 20 // 20 fichiers max par requête
    }
});

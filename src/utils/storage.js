const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // 📂 Point de montage NAS direct
        const baseUploadDir = path.join(__dirname, '../../uploads');
        const subPath = req.body.folderPath || '';
        let targetDir = path.join(baseUploadDir, subPath);

        // Sécurité anti-traversée de répertoire
        if (!targetDir.startsWith(baseUploadDir)) {
            return cb(new Error('Chemin invalide.'));
        }

        try {
            const stat = fs.statSync(targetDir);
            if (stat.isFile()) {
                targetDir = path.dirname(targetDir);
            }
        } catch (err) {
            // Si le chemin n'existe pas du tout, on crée le dossier
            try {
                fs.mkdirSync(targetDir, { recursive: true });
            } catch (mkdirErr) {
                return cb(mkdirErr);
            }
        }
        cb(null, targetDir);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

module.exports = multer({ storage });
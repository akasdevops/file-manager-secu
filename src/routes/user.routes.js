const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const auth = require('../middlewares/auth');
const { readData, saveData } = require('../config/database');

router.post('/change-password', auth, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const db = readData();
    const user = db.users.find(u => u.id === req.user.id);

    if (!user || !(await bcrypt.compare(oldPassword, user.password))) {
        return res.status(400).json({ error: 'Ancien mot de passe incorrect.' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    saveData(db);
    res.json({ message: 'Mot de passe mis à jour avec succès.' });
});

module.exports = router;
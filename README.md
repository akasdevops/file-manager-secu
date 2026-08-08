# ☁️ CloudSpace Pro

**CloudSpace Pro** est une application web moderne et élégante d'exploration et de gestion de fichiers en nuage (type Google Drive / Nextcloud). Elle offre une interface réactive, un thème sombre/clair avec fort contraste, un système de gestion des utilisateurs avec panneau d'administration et des aperçus en ligne.

---

## ✨ Fonctionnalités Principales

### 📁 Gestion de fichiers & dossiers
- **Explorateur intuitif :** Navigation par dossiers avec fil d'Ariane (*breadcrumb*).
- **Téléversement & Drag & Drop :** Importation de fichiers simples ou multiples par glisser-déposer.
- **Aperçu multimédia :** Visualisation directe dans le navigateur pour les images, vidéos, fichiers PDF, code et texte brut.
- **Téléchargement & Suppression :** Récupération et nettoyage des fichiers en un clic.
- **Recherche instantanée :** Filtrage dynamique des fichiers et dossiers par nom.
- **Badges colorés :** Identification visuelle par types de fichiers (Images, PDF, Code, Médias, Dossiers).

### 👥 Authentification & Utilisateurs
- Connexion / Inscription sécurisée via API REST (JWT).
- Changement de mot de passe sécurisé depuis l'interface utilisateur.
- Gestion du quota de stockage avec barre de progression en dégradé.

### 🛡️ Panneau d'Administration (Rôle ADMIN)
- **Gestion des accès :** Validation ou refus manuel des nouveaux comptes.
- **Paramètres système :** Activation/Désactivation des inscriptions publiques.
- **Gestion des comptes :** Modification des rôles, suspension ou suppression d'utilisateurs.
- **Suivi du stockage :** Visualisation de l'espace mémoire consommé par chaque utilisateur.

### 🎨 Design & Ergonomie
- **Thème Sombre / Clair :** Basculement dynamique adapté aux préférences de l'utilisateur.
- **Haute Lisibilité :** Contrastes renforcés et typographie soignée.
- **Design Responsive :** Adapté aux écrans mobiles, tablettes et ordinateurs.

---

## 🛠️ Stack Technique

- **Frontend :** HTML5, Tailwind CSS (via CDN), JavaScript Vanilla (ES6+), Lucide Icons.
- **Backend (Recommandé) :** Node.js / Express.js ou tout serveur compatible REST API.
- **Stockage & BDD :** Système de fichiers local / S3, SQLite ou PostgreSQL / MongoDB.

---

## 🚀 Installation et Démarrage

### 1. Prérequis
- [Node.js](https://nodejs.org/) (version 18 ou supérieure)
- Un gestionnaire de paquets (`npm` ou `yarn`)

### 2. Cloner le projet
```bash
git clone https://github.com/votre-compte/cloudspace-pro.git
cd cloudspace-pro
```

### 3. Installer les dépendances
```bash
npm install
```

### 4. Structure des dossiers
```text
cloudspace-pro/
├── uploads/                # Stockage physique des fichiers téléversés
├── data/                   # Stockage des données BDD
│   └── users.json          # Base de données locale (Fichier JSON)
├── public/
│   └── index.html          # Frontend (UI & Logique client)
├── src/
│   ├── server.js           # Helpers réutilisables
│   ├── config/             # Configuration globale
│   │   └── database.js     # Gestion de la lecture/écriture dans users.json
│   ├── middlewares/        # Sécurité et contrôle d'accès
│   │   ├── auth.js         # Vérification du token JWT
│   │   └── admin.js        # Vérification du rôle ADMIN
│   ├── routes/             # Découpage des endpoints API
│   │   ├── auth.routes.js  # /api/auth (Login, Register)
│   │   ├── files.routes.js # /api/files (Upload, Browse, Delete, Download)
│   │   ├── admin.routes.js # /api/admin (Gestion des utilisateurs & système)
│   │   └── user.routes.js  # /api/user (Changement de mot de passe)
│   └── utils/              # Helpers réutilisables
│       └── storage.js      # Configuration de Multer pour les uploads
├── uploads/                # Stockage physique des fichiers téléversés
├── .env                    # Clé secrète JWT & variables d'environnement
├── package.json            # Dépendances Node.js
└── README.md               # Documentation du projet

```

### 5. Démarrer le serveur
```bash
npm start
# ou en mode développement
npm run dev
```

Rendez-vous ensuite sur `http://localhost:3000`.

---

## 🔌 Documentation des Endpoints API

### 🔑 Authentification (`/api/auth`)
- `POST /api/auth/register` : Créer un nouveau compte.
- `POST /api/auth/login` : Se connecter et obtenir un token JWT.

### 📂 Fichiers (`/api/files`)
- `GET /api/files/browse?path=` : Lister les fichiers et dossiers du chemin spécifié.
- `POST /api/files/upload` : Téléverser un ou plusieurs fichiers.
- `POST /api/files/folder` : Créer un nouveau dossier.
- `GET /api/files/download?filePath=&preview=` : Télécharger ou prévisualiser un fichier.
- `DELETE /api/files` : Supprimer un fichier ou un dossier.

### ⚙️ Administration (`/api/admin`)
- `GET /api/admin/settings` : Récupérer les paramètres système.
- `POST /api/admin/settings` : Mettre à jour les paramètres système.
- `GET /api/admin/users` : Lister tous les utilisateurs enregistrés.
- `PUT /api/admin/users/:id/status` : Approuver ou désactiver un utilisateur.
- `DELETE /api/admin/users/:id` : Supprimer un utilisateur.

### 👤 Utilisateur (`/api/user`)
- `POST /api/user/change-password` : Modifier son mot de passe.

---

## 📝 Licence

Ce projet est sous licence **MIT**. Vous êtes libre de le modifier et de le distribuer.

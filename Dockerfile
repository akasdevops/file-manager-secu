# Utilisation d'une image Node.js légère
FROM node:22-alpine

# Création du répertoire de travail
WORKDIR /app

# Copie des fichiers de dépendances
COPY package*.json ./

# Installation des dépendances de production
RUN npm ci --only=production

# Copie du reste du code source
COPY . .

# Déclarer les volumes pour conserver la BDD et les uploads sur l'hôte
VOLUME ["/app/uploads", "/app/data"]

# Exposition du port de l'application
EXPOSE 3000

# Commande de démarrage
CMD ["node", "server.js"]

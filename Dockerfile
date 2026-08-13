# Utilisation d'une image Node.js légère
FROM node:20-alpine

# Création du répertoire de travail
WORKDIR /app

# Copie uniquement les fichiers de dépendances
COPY package.json package-lock.json ./

# Installation des dépendances de production
RUN npm ci --only=production

# Copie uniquement l'essentiel du code source
COPY public ./public
COPY src ./src

# Déclarer les volumes pour conserver la BDD et les uploads sur l'hôte
VOLUME ["/app/uploads", "/app/data"]

# Exposition du port de l'application
EXPOSE 8080

# Commande de démarrage
CMD ["node", "src/server.js"]

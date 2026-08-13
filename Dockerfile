# Utilisation d'une image Node.js LTS légère (Alpine)
FROM node:22-alpine

# Création du répertoire de travail
WORKDIR /app

# Mode production (optimisations + vérification stricte de JWT_SECRET au démarrage)
ENV NODE_ENV=production

# Mise à jour des paquets de la couche Alpine (corrige les CVE de busybox/musl/openssl...)
RUN apk upgrade --no-cache

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

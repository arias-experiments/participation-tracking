FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=development

# Source is bind-mounted by Compose; dependencies stay in a separate volume.
# The backend package.json should provide a dev script (for example,
# node --watch server.js), and Express should listen on 0.0.0.0:3000.
EXPOSE 3000
CMD ["sh", "-c", "npm install && exec npm run dev"]

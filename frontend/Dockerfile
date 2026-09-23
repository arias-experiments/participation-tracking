FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=development

# Source is bind-mounted by Compose; dependencies stay in a separate volume.
# Install at startup so dependency changes are reflected on restart.
EXPOSE 5173
CMD ["sh", "-c", "npm install && exec npm run dev -- --host 0.0.0.0 --port 5173 --strictPort"]

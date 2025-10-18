#!/bin/bash
echo "Setting up Web Crawler..."

# Создаем папки
mkdir -p server public

# Создаем package.json для server
cat > server/package.json << 'EOF'
{
  "name": "web-crawler-server",
  "version": "1.0.0",
  "description": "Advanced web crawler for collecting all site pages",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "axios": "^1.6.0",
    "cheerio": "^1.0.0-rc.12",
    "puppeteer": "^21.5.0",
    "url-parse": "^1.5.10"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
EOF

echo "✅ Setup complete!"
echo "📁 Next steps:"
echo "1. cd server"
echo "2. npm install"
echo "3. npm start"
echo "4. Open http://localhost:3000"

const express = require('express');
const fs = require('fs');
const path = require('path');
const gtts = require('gtts');
const crypto = require('crypto');

const app = express();
const port = 3030;
const ADMIN_PASSWORD = 'irriteoadmin'; // mude isso depois

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const messagesFilePath = path.join(__dirname, 'messages.json');
const bannedIpsFilePath = path.join(__dirname, 'banned_ips.json');

let messages = [];
let bannedIps = new Set();
let rateLimit = new Map();

function loadJson(filepath, fallback) {
  try {
    if (!fs.existsSync(filepath)) {
      fs.writeFileSync(filepath, JSON.stringify(fallback));
      return fallback;
    }
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    console.error('erro carregando', filepath, e);
    return fallback;
  }
}

function saveMessages() {
  try { fs.writeFileSync(messagesFilePath, JSON.stringify(messages, null, 2)); }
  catch (e) { console.error('erro salvando mensagens:', e); }
}

function saveBannedIps() {
  try { fs.writeFileSync(bannedIpsFilePath, JSON.stringify([...bannedIps])); }
  catch (e) { console.error('erro salvando IPs banidos:', e); }
}

messages = loadJson(messagesFilePath, []);
bannedIps = new Set(loadJson(bannedIpsFilePath, []));

function sanitize(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // Use only the first IP (original client)
    return forwarded.split(',')[0].trim();
  }
  const addr = req.socket.remoteAddress;
  if (addr && addr.startsWith('::ffff:')) return addr.substring(7);
  return addr || 'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 5000;
  const maxReqs = 3;
  if (!rateLimit.has(ip)) {
    rateLimit.set(ip, []);
  }
  const times = rateLimit.get(ip).filter(t => now - t < windowMs);
  if (times.length >= maxReqs) return false;
  times.push(now);
  rateLimit.set(ip, times);
  return true;
}

// Clean up stale audio files on startup
app.post('/speak', (req, res) => {
  const text = req.body.text;
  const clientIp = getClientIp(req);

  if (bannedIps.has(clientIp)) {
    return res.status(403).sendFile(path.join(__dirname, 'public', 'banned.html'));
  }

  if (!text || text.trim().length === 0) {
    return res.status(400).send('texto vazio');
  }

  if (text.length > 500) {
    return res.status(413).send('texto muito longo (max 500 chars)');
  }

  if (!checkRateLimit(clientIp)) {
    return res.status(429).send('calma la, espera 5s entre mensagens');
  }

  const timestamp = new Date().toISOString();
  const safeName = timestamp.replace(/[:.]/g, '-');
  const fileName = `audio_${safeName}.mp3`;
  const filePath = path.join(__dirname, 'public', fileName);

  const tts = new gtts(text, 'pt');
  tts.save(filePath, (err) => {
    if (err) {
      console.error('Erro TTS:', err);
      return res.status(500).send('erro gerando audio');
    }

    const entry = { text, timestamp, fileName, ip: clientIp };
    messages.push(entry);
    saveMessages();

    console.log(`msg de ${clientIp}: ${text.substring(0, 60)}`);

    // Keep only last 50 messages, delete old audio files
    while (messages.length > 50) {
      const old = messages.shift();
      const oldPath = path.join(__dirname, 'public', old.fileName);
      fs.unlink(oldPath, () => {});
    }
    saveMessages();

    res.send('ok');
  });
});

app.get('/messages', (req, res) => {
  // Return sanitized data for the admin page
  const safe = messages.map(m => ({
    text: sanitize(m.text),
    ip: sanitize(m.ip),
    timestamp: m.timestamp,
    fileName: m.fileName
  }));
  res.json(safe);
});

app.post('/ban', (req, res) => {
  const { ip, password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).send('senha errada');
  }
  if (!ip) return res.status(400).send('ip necessario');
  bannedIps.add(ip);
  saveBannedIps();
  res.send(`ip ${ip} banido`);
});

app.post('/unban', (req, res) => {
  const { ip, password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).send('senha errada');
  }
  if (!ip) return res.status(400).send('ip necessario');
  bannedIps.delete(ip);
  saveBannedIps();
  res.send(`ip ${ip} desbanido`);
});

app.get('/check-ban', (req, res) => {
  res.json({ banned: bannedIps.has(getClientIp(req)) });
});

app.listen(port, () => {
  console.log(`irriteolorenzo rodando em http://localhost:${port}/`);
});

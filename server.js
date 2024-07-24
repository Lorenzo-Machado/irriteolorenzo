const express = require('express');
const fs = require('fs');
const path = require('path');
const gtts = require('gtts');
const app = express();
const port = 3030;

app.use(express.static('public')); // Serve static files from 'public' directory
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Parse JSON bodies

const messagesFilePath = path.join(__dirname, 'messages.json');
const bannedIpsFilePath = path.join(__dirname, 'banned_ips.json');

let messages = loadMessages(); // Load messages from file
let bannedIps = loadBannedIps(); // Load banned IPs from file

function loadMessages() {
  try {
    if (!fs.existsSync(messagesFilePath)) {
      fs.writeFileSync(messagesFilePath, JSON.stringify([])); // Create empty JSON file if it doesn't exist
    }
    const data = fs.readFileSync(messagesFilePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('erro carregando msg:', err);
    return [];
  }
}

function saveMessages() {
  try {
    fs.writeFileSync(messagesFilePath, JSON.stringify(messages, null, 2));
  } catch (err) {
    console.error('erro salvando msg:', err);
  }
}

function loadBannedIps() {
  try {
    if (!fs.existsSync(bannedIpsFilePath)) {
      fs.writeFileSync(bannedIpsFilePath, JSON.stringify([])); // Create empty JSON file if it doesn't exist
    }
    const data = fs.readFileSync(bannedIpsFilePath, 'utf8');
    return new Set(JSON.parse(data)); // Use a Set to store banned IPs
  } catch (err) {
    console.error('erro carregando os IPs:', err);
    return new Set();
  }
}

function saveBannedIps() {
  try {
    fs.writeFileSync(bannedIpsFilePath, JSON.stringify([...bannedIps])); // Convert Set to Array before saving
  } catch (err) {
    console.error('erro salvando o IP:', err);
  }
}

app.post('/speak', (req, res) => {
  const text = req.body.text;
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress; // Get client IP

  if (bannedIps.has(clientIp)) {
    return res.status(403).sendFile(path.join(__dirname, 'public', 'banned.html')); // Serve banned page
  }

  if (text) {
    const timestamp = new Date().toISOString().replace(/:/g, '-'); // Replace : with -
    const fileName = `audio_${timestamp}.mp3`; // Unique file name based on timestamp
    const filePath = path.join(__dirname, 'public', fileName);

    const gttsInstance = new gtts(text, 'pt'); // 'en' for English language

    gttsInstance.save(filePath, (err) => {
      if (err) {
        console.error('erro:', err);
        return res.status(500).send('erro gerando falha');
      }

      const message = { text, timestamp, fileName, ip: clientIp };
      messages.push(message); // Store the message with timestamp, file name, and IP
      saveMessages(); // Save messages to file

      // Delete old files except the latest one
      if (messages.length > 1) {
        const oldMessage = messages[messages.length - 2];
        const oldFilePath = path.join(__dirname, 'public', oldMessage.fileName);
        fs.unlink(oldFilePath, (err) => {
          if (err) {
            console.error('erro deletando o arquivo véio paia:', err);
          } else {
            console.log(`arquivo véio paia deletado: ${oldMessage.fileName}`);
          }
        });
      }

      res.send('audio gerado com sucesso');
    });
  } else {
    res.status(400).send('nenhum texto fornecido');
  }
});

app.get('/messages', (req, res) => {
  res.json(messages); // Provide messages as JSON
});

app.post('/ban', (req, res) => {
  const { ip } = req.body;
  if (ip) {
    bannedIps.add(ip);
    saveBannedIps(); // Save banned IPs to file
    res.send(`O IP ${ip} foi banido com sucesso`);
  } else {
    res.status(400).send('nenhum IP fornecido');
  }
});

app.post('/unban', (req, res) => {
  const { ip } = req.body;
  if (ip) {
    bannedIps.delete(ip);
    saveBannedIps(); // Save banned IPs to file
    res.send(`o IP: ${ip} foi desbanido com sucesso`);
  } else {
    res.status(400).send('nenhum IP fornecido');
  }
});

app.get('/check-ban', (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress; // Get client IP
  const banned = bannedIps.has(clientIp);
  res.json({ banned });
});

app.listen(port, () => {
  console.log(`servidor rodando em http://localhost:${port}/`);
});

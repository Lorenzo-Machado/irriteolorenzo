const express = require('express');
const fs = require('fs');
const path = require('path');
const gtts = require('gtts');
const app = express();
const port = 3030;

app.use(express.static('public')); 
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Parse JSON bodies

const messagesFilePath = path.join(__dirname, 'messages.json');
const bannedIpsFilePath = path.join(__dirname, 'banned_ips.json');

let messages = loadMessages(); // carrega as mensagens do json 
let bannedIps = loadBannedIps(); // carrega os Ip do json de ip banidos

function loadMessages() {
  try {
    if (!fs.existsSync(messagesFilePath)) {
      fs.writeFileSync(messagesFilePath, JSON.stringify([])); // cria uym json pras mensagens caso n tenha um
    }
    const data = fs.readFileSync(messagesFilePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('erro carregando mensagens:', err);
    return [];
  }
}

function saveMessages() {
  try {
    fs.writeFileSync(messagesFilePath, JSON.stringify(messages, null, 2));
  } catch (err) {
    console.error('erro salvando mensagens:', err);
  }
}

function loadBannedIps() {
  try {
    if (!fs.existsSync(bannedIpsFilePath)) {
      fs.writeFileSync(bannedIpsFilePath, JSON.stringify([])); // cria um json de ip banido caso n tenha um
    }
    const data = fs.readFileSync(bannedIpsFilePath, 'utf8');
    return new Set(JSON.parse(data)); // Use a Set to store banned IPs
  } catch (err) {
    console.error('erro carregando IPs banidos:', err);
    return new Set();
  }
}

function saveBannedIps() {
  try {
    fs.writeFileSync(bannedIpsFilePath, JSON.stringify([...bannedIps])); // converte Set pra Array antes de salvar
  } catch (err) {
    console.error('Erro salvando IPs banidos:', err);
  }
}

app.post('/speak', (req, res) => {
  const text = req.body.text;
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress; // pega o ip do usuario

  if (bannedIps.has(clientIp)) {
    return res.status(403).sendFile(path.join(__dirname, 'public', 'banned.html')); // redireciona pra pagina de banido
  }

  if (text) {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const fileName = `audio_${timestamp}.mp3`; // cria um arquivo com nome unico com a data 
    const filePath = path.join(__dirname, 'public', fileName);

    const gttsInstance = new gtts(text, 'pt'); // aq tu muda a lingua dessa porra

    gttsInstance.save(filePath, (err) => {
      if (err) {
        console.error('Erro:', err);
        return res.status(500).send('Eeo gerando áudio');
      }

      const message = { text, timestamp, fileName, ip: clientIp };
      messages.push(message); // salva as msg com o conteudo da msg, data, nome do arquivo e ip  
      saveMessages(); // salva as msg no arquivo

      // log de mensagem no server
      console.log(`Data: ${timestamp}, IP: ${clientIp}, Mensagem: ${text}`);

      // deleta o audio antigo q já foi tocado
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
  res.json(messages); // da uma mesage .json
});

app.post('/ban', (req, res) => {
  const { ip } = req.body;
  if (ip) {
    bannedIps.add(ip);
    saveBannedIps(); // salva o ip banido num json
    res.send(`o IP ${ip} foi banido com sucesso`);
  } else {
    res.status(400).send('nenhum IP fornecido');
  }
});

app.post('/unban', (req, res) => {
  const { ip } = req.body;
  if (ip) {
    bannedIps.delete(ip);
    saveBannedIps(); // ip salvo em um arquivo goré
    res.send(`o IP ${ip} foi desbanido com sucesso`);
  } else {
    res.status(400).send('nenhum IP fornecido');
  }
});

app.get('/check-ban', (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress; // pega o ip do usuario
  const banned = bannedIps.has(clientIp);
  res.json({ banned });
});

app.listen(port, () => {
  console.log(`servidor rodando em http://localhost:${port}/`);
});

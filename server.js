const express = require('express');
const bodyParser = require('body-parser');
const gtts = require('gtts');
const path = require('path');
const play = require('play-sound')();
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/speak', (req, res) => {
  const text = req.body.text;
  const speech = new gtts(text, 'en');
  const filePath = path.join(__dirname, 'public', 'speech.mp3');

  speech.save(filePath, (err, result) => {
    if (err) {
      console.error('Error in generating speech:', err);
      return res.status(500).send('Error in generating speech');
    }

    // Emit the event to play the audio
    io.emit('play-audio', '/speech.mp3');

    res.send('/speech.mp3');
  });
});

io.on('connection', (socket) => {
  console.log('A user connected');
  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

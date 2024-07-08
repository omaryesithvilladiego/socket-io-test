
// Reemplaza esto con tu URI de conexión


const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const mongoURI = 'mongodb+srv://omar:080898@cluster0.y97fe3h.mongodb.net/chat?retryWrites=true&w=majority&appName=Cluster0'; 
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB connection error:', err));

// Define el esquema y el modelo para los mensajes
const messageSchema = new mongoose.Schema({
  content: String,
  userId: String,
  username: String,
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// Define el esquema y el modelo para los usuarios
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  userId: String
});

const User = mongoose.model('User', userSchema);

// Sirve el archivo HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Configura Express para servir archivos estáticos desde la carpeta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Maneja las conexiones de Socket.IO
io.on('connection', (socket) => {
  console.log('a user connected');

  // Solicitar mensajes históricos cuando un usuario se conecta
  socket.on('get messages', async () => {
   await Message.find().sort({ timestamp: 1 }).then(messages => {
      io.to(socket.id).emit('load messages', messages.map(message => ({
        content: message.content,
        username: message.username,
        timestamp: message.timestamp
      })));
    }).catch(err => console.log('Error retrieving messages:', err));
  });

  // Maneja el registro de nuevos usuarios
  socket.on('register', async ({ username, password }) => {
    try {
      const existingUser = await User.findOne({ username: username });
      if (existingUser) {
        socket.emit('register failure');
        return;
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = new User({
        username: username,
        password: hashedPassword,
        userId: socket.id
      });

      await user.save();
      socket.emit('register success', user.userId);
      socket.emit('get messages'); // Solicita mensajes históricos al usuario registrado
    } catch (error) {
      console.error('Error during registration:', error);
      socket.emit('register failure');
    }
  });

  // Maneja el inicio de sesión de usuarios
  socket.on('login', async ({ username, password }) => {
    try {
      const user = await User.findOne({ username: username });
      if (user && await bcrypt.compare(password, user.password)) {
        socket.emit('login success', user.userId);
        socket.emit('get messages'); // Solicita mensajes históricos al usuario que inicia sesión
      } else {
        socket.emit('login failure');
      }
    } catch (error) {
      console.error('Error during login:', error);
      socket.emit('login failure');
    }
  });

  // Maneja el envío de mensajes
  socket.on('chat message', ({ content, userId }) => {
    console.log('message: ' + content);

    User.findOne({ userId: userId }).then(user => {
      if (user) {
        const message = new Message({
          content: content,
          userId: userId,
          username: user.username
        });
        message.save()
          .then(() => {
            io.emit('chat message', { content: content, username: user.username, timestamp: message.timestamp });
          })
          .catch(err => console.log('Error saving message:', err));
      }
    });
  });

  // Maneja la desconexión de los clientes
  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

// Inicia el servidor
server.listen(3000, () => {
  console.log('listening on *:3000');
});

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const mysql = require('mysql2/promise');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const compression = require('compression');
const authRoutes = require('./routes/auth');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 3000;

// MySQL connection pool
const pool = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: '',
  database: 'torn',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Session store
const sessionStore = new MySQLStore({}, pool);
const sessionMiddleware = session({
  key: 'api',
  secret: 'session_cookie_secret',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 60 * 1000 }
});

// Middleware setup
app.use(sessionMiddleware);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(compression());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Share session with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Make io and pool accessible in routes/controllers
app.set('io', io);
app.set('pool', pool);

// Receive allowedFactionIds from master process
let allowedFactionIds = [];

process.on('message', (msg) => {
  if (msg.type === 'updateAllowedFactionIds') {
    allowedFactionIds = msg.data;
    console.log(`[Worker ${process.pid}] Updated allowedFactionIds:`, allowedFactionIds);
  }
});

app.use((req, res, next) => {
  req.app.locals.allowedFactionIds = allowedFactionIds;
  next();
});

// Routes
app.use('/auth', authRoutes);
app.get('/', (req, res) => {
  res.redirect('/auth/login');
});

server.listen(PORT, () => {
  console.log(`Worker ${process.pid} running on http://localhost:${PORT}`);
});

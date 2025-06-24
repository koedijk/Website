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
const PORT = process.env.PORT || 3000;
let allowedFactionIds = [];						   

// Trust proxy if behind Nginx or similar
app.set('trust proxy', 1);									 
// MySQL connection pool
const pool = mysql.createPool({
 host: process.env.DB_HOST,
 user: process.env.DB_USER,
 password: process.env.DB_PASSWORD,
 database: process.env.DB_NAME,
 waitForConnections: true,
 connectionLimit: 10,
 queueLimit: 0
});

// Session store
const sessionStore = new MySQLStore({}, pool);
const sessionMiddleware = session({
 key: 'api',
 secret: process.env.SESSION_SECRET,
 store: sessionStore,
 resave: false,
 saveUninitialized: false,
 cookie: {
 maxAge: 30 * 60 * 1000,
 secure: false, // Set to true if using HTTPS
 sameSite: 'lax'
 }	
});

// Middleware setup
app.use(sessionMiddleware);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(compression());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('io', io);
app.set('pool', pool);
// Share session with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

app.use('/public/dashboard.js', (req, res) => {
  res.status(403).send('Access denied');
});




let totalConnections = 0;

io.on('connection', (socket) => {
  totalConnections++;
  //console.log(`Socket connected: ${socket.id} | Total: ${totalConnections}`);

  socket.on('disconnect', () => {
    totalConnections--;
    //console.log(`Socket disconnected: ${socket.id} | Total: ${totalConnections}`);
  });
});


process.on('message', (msg) => {
  if (msg.type === 'updateAllowedFactionIds') {
    allowedFactionIds = msg.data;
    //console.log(`[Worker ${process.pid}] Updated allowedFactionIds:`, allowedFactionIds);
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
  //console.log(`Worker ${process.pid} running on http://localhost:${PORT}`);
});

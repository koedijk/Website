require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const mysql = require('mysql2/promise'); // Use promise-based API
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const authRoutes = require('./routes/auth');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 3000;
const compression = require('compression');


// MySQL connection pool
const pool = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: '',
  database: 'torn',
  waitForConnections: true,
  connectionLimit: 10, // Adjust based on your DB capacity
  queueLimit: 0
});

// Test connection
pool.getConnection()
  .then(conn => {
    console.log('Connected to database.');
    conn.release();
  })
  .catch(err => {
    console.error('Database connection failed:', err.stack);
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


// Routes
app.use('/auth', authRoutes);
app.get('/', (req, res) => {
  res.redirect('/auth/login');
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

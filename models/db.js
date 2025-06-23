
const mysql = require('mysql2');
const winston = require('winston');

// Create a connection pool
const pool = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: '',
  database: 'torn',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
}).promise();

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/db_errors.log', level: 'error' })
  ]
});

// Helper function to execute queries with error logging
async function executeQuery(query, params = []) {
  try {
    const [results] = await pool.execute(query, params);
    return results;
  } catch (error) {
    logger.error('Database query failed', { query, params, error: error.message });
    throw error;
  }
}


module.exports = {
  pool,
  executeQuery
};

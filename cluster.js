const cluster = require('cluster');
const os = require('os');
const mysql = require('mysql2/promise');

const numCPUs = os.cpus().length;

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running. Forking ${numCPUs} workers...`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  // Restart dead workers
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });

  // Create MySQL pool in master
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: 'root',
    password: '',
    database: 'torn',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  // Function to fetch and broadcast allowedFactionIds
  const updateAllowedFactionIds = async () => {
    try {
      const [results] = await pool.query(
        'SELECT DISTINCT factionid FROM allowedfaction WHERE factionid IS NOT NULL'
      );
      const ids = results.map(row => row.factionid);
      console.log('[Master] Broadcasting allowedFactionIds:', ids);

      for (const id in cluster.workers) {
        cluster.workers[id].send({ type: 'updateAllowedFactionIds', data: ids });
      }
    } catch (err) {
      console.error('[Master] Failed to update allowedFactionIds:', err);
    }
  };

  // Initial update and interval
  updateAllowedFactionIds();
  setInterval(updateAllowedFactionIds, 5 * 60 * 1000); // every 5 minutes

} else {
  require('./server.js'); // Worker logic
}

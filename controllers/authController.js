const db = require('../models/db');
const apicalls = require('../calls/apicalls');
const { encrypt, decrypt, isHex } = require('../utils/encryption');
const shortenDestination = (desc) => {
  const map = {
    'United Kingdom': 'UK',
    'Switzerland': 'Swiss',
    'Mexico': 'Mex',
    'Canada': 'Can',
    'UAE': 'UAE',
    'China': 'China',
    'Argentina': 'Arg',
    'South Africa': 'SA',
    'Japan': 'Japan',
    'Torn': 'Torn',
    'Cayman Islands': 'Cayman'
  };

  if (desc.includes('Returning to Torn from')) {
    const match = desc.match(/Returning to Torn from ([A-Za-z ]+)/i);
    if (match && map[match[1]]) {
      return `Return from -  ${map[match[1]]}`;
    }
  }

  const toMatch = desc.match(/to ([A-Za-z ]+)/i);
  const inMatch = desc.match(/in ([A-Za-z ]+)/i);
  const fromMatch = desc.match(/from ([A-Za-z ]+)/i);

  if (toMatch && map[toMatch[1]]) {
    return `Travel to - ${map[toMatch[1]]}`;
  } else if (inMatch && map[inMatch[1]]) {
    return `Abroad in - ${map[inMatch[1]]}`;
  }
  else if (fromMatch && map[fromMatch[1]]) {
    return `Return from - ${map[fromMatch[1]]}`;
  }
  return desc;
};

exports.getLogin = (req, res) => {
  res.render('login', { error: null });
};

// Handle login form submission

exports.postLogin = async (req, res) => {
  const { api_key } = req.body;
  const allowedFactionIds = req.app.locals.allowedFactionIds;
  const pool = req.app.get('pool');
  try {
    // Step 1: Check if user already exists
    const [userResults] = await pool.query(
      'SELECT * FROM users WHERE api_key = ?',
      [api_key]
    );

    if (userResults.length > 0) {
      const user = userResults[0];
      return await handleLogin(req, res, user.name, user.factionid, user.tornid, api_key, pool);
    }
    // Step 2: Check if API key is in allowedfaction
    const [allowedResults] = await pool.query(
      'SELECT * FROM allowedfaction WHERE api_key = ?',
      [api_key]
    );
    const check = await apicalls.checkApi(api_key);
    const currentFactionId = check.basic.id;

    if (allowedResults.length > 0) {
      const allowed = allowedResults[0];

      // Step 2a: If factionid is null, update it
      if (!allowed.factionid) {
        await pool.query(
          'UPDATE allowedfaction SET factionid = ? WHERE api_key = ?',
          [currentFactionId, api_key]
        );
      } else if (!allowedFactionIds.includes(currentFactionId)) {
        // Step 2b: Faction mismatch
        return res.render('login', { error: 'Faction mismatch. Access Denied.' });
      }

      // Proceed to create user and login
    } else {
      // Step 3: Check if the API key's faction matches any allowed faction
      const [factionMatches] = await pool.query(
        'SELECT * FROM allowedfaction WHERE factionid = ?',
        [currentFactionId]
      );

      if (factionMatches.length === 0) {
        return res.render('login', { error: 'Access Denied. Faction not allowed.' });
      }
    }

    // Step 4: Create user and proceed with login
    const basicinfo = await apicalls.basicInfo(api_key);
    const tornid = basicinfo.player_id;
    const playername = basicinfo.name;
    await pool.query(
      `INSERT INTO users (tornid, name, factionid, api_key)
VALUES (?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
name = VALUES(name),
api_key = VALUES(api_key)`,
      [tornid, playername, currentFactionId, api_key]
    );


    await handleLogin(req, res, playername, currentFactionId, tornid, api_key, pool);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).send('Login error: #aC55');
  }
};



async function handleLogin(req, res, playername, factionid, tornid, apiKey, pool) {
  try {
    await pool.query(
      "DELETE FROM sessions WHERE JSON_EXTRACT(data, '$.apiKey') = ?",
      [apiKey]
    );

    req.session.tornName = playername;
    req.session.tornId = tornid;
    req.session.factionId = factionid;
    req.session.apiKey = encrypt(apiKey);

    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).send('Session error');
      }
      res.redirect('/auth/dashboard');
    });
  } catch (err) {
    console.error('Session cleanup error:', err);
    res.status(500).send('Session cleanup failed');
  }
}


// Dashboard
exports.getDashboard = async (req, res) => {
  if (!req.session || !req.session.apiKey) {
    return res.redirect('/auth/login');
  }

  try {
    const apiKey = isHex(req.session.apiKey) ? decrypt(req.session.apiKey) : req.session.apiKey;
    const myFactionId = req.session.factionId;

    const rankedWars = await apicalls.getRankedWars(apiKey);
    let selectedWar = rankedWars.find(war => war.winner === null);
    if (!selectedWar) {
      selectedWar = rankedWars.find(war => war.winner !== null);
      req.session.enemyid = selectedWar.factions.find(f => f.id !== parseInt(myFactionId));
    }
    req.session.enemyid = selectedWar.factions.find(f => f.id !== parseInt(myFactionId));

    const enemyData = await apicalls.getFactionBasic(apiKey, req.session.enemyid);
    const enemyMembersRaw = Object.values(enemyData.members);

    const claims = await new Promise((resolve, reject) => {
      db.query(
        `SELECT name, claimed_by FROM enemy_faction_members
         WHERE war_with_factionid = ?`,
        [myFactionId],
        (err, results) => {
          if (err) return reject(err);
          const map = {};
          results.forEach(row => {
            map[row.name] = row.claimed_by;
          });
          resolve(map);
        }
      );
    });

    const enemyMembers = enemyMembersRaw.map(member => {
      const rawDescription = member.status?.description || 'Unknown';
      const status = shortenDestination(rawDescription);
      const statusState = member.status?.state || 'Unknown';
      return {
        name: member.name,
        tornid: member.id,
        factionid: req.session.enemyid,
        status,
        statusState,
        statusUntil: member.status?.until ? parseInt(member.status.until, 10) : null,
        claimedBy: claims[member.name] || null
      };
    });
    res.render('dashboard', {
      tornName: req.session.tornName,
      tornId: req.session.tornId,
      factionId: req.session.factionId,
      enemyMembers,
      enemyFactionName: enemyFaction.name,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).send('Failed to load dashboard');
  }
};

exports.fetchEnemyLive = async (req, res) => {

  if (!req.session || !req.session.apiKey) {
    return res.status(401).send('Session expired');
  }

  const encryptedKey = req.session.apiKey;
  const apiKey = isHex(encryptedKey) ? decrypt(encryptedKey) : encryptedKey;
  const myFactionId = req.session.factionId;
  try {
  
    const enemyData = await apicalls.getFactionBasic(apiKey, req.session.enemyid);
    console.log(enemyData);
    const updates = Object.values(enemyData.members).map(member => {
    const rawDescription = member.status?.description || 'Unknown';
	  const status = shortenDestination(rawDescription);
    const statusState = member.status?.state || 'Unknown';
      return {
        name: member.name,
        tornid: member.id,
        factionid: req.session.enemyid,
        status,
        statusState,
        statusUntil: member.status?.until
      };
    });
    updates.forEach(member => {
      db.query(`
                INSERT INTO enemy_faction_members (
                    name, tornid, factionid, status, timer, war_with_factionid, changedate
                )
                VALUES (?, ?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    status = VALUES(status),
                    timer = VALUES(timer),
                    war_with_factionid = VALUES(war_with_factionid),
                    changedate = NOW()
            `, [
        member.name,
        member.tornid,
        member.factionid,
        member.status,
        member.statusUntil,
        myFactionId
      ], (err) => {
        if (err) console.error('DB insert error:', err);
      });
    });
    return res.render('dashboard', {
        tornName: req.session.tornName,
        tornId: req.session.tornId,
        factionId: req.session.factionId,
        enemyMembers: [],
        enemyFactionName: 'No enemy faction found',
  });

  } catch (err) {
    console.error('Live update error:', err);
    res.sendStatus(500);
  }
};


// Claim and cancel
exports.claim = (req, res) => {
  const { name } = req.body;
  const claimedBy = req.session.tornName;
  const myFactionId = req.session.factionId;
  const io = req.app.get('io');

  db.query(
    'SELECT * FROM enemy_faction_members WHERE name = ? AND war_with_factionid = ?',
    [name, myFactionId],
    (err, results) => {
      if (err || results.length === 0) {
        console.error('Claim lookup error:', err);
        return res.status(500).send('Claim lookup error');
      }

      const member = results[0];
      const now = Math.floor(Date.now() / 1000);
      const status = member.laststatus;
      const statusUntil = member.status_until ? Math.floor(new Date(member.status_until).getTime() / 1000) : null;

      const canClaim =
        status === 'Okay' ||
        (status === 'Hospital' && statusUntil && statusUntil - now < 300);

      if (!canClaim) {
        return res.status(400).send('Cannot claim this member');
      }

      db.query(
        'UPDATE enemy_faction_members SET claimed_by = ? WHERE name = ? AND war_with_factionid = ?',
        [claimedBy, name, myFactionId],
        (err) => {
          if (err) {
            console.error('Claim update error:', err);
            return res.status(500).send('Claim update error');
          }


          const room = `faction_${req.session.factionId}`;
          io.to(room).emit('claimUpdate', {
            name,
            claimedBy,
            status,
            statusUntil: member.status_until
          });


          res.redirect('/auth/dashboard');
        }
      );
    }
  );
};

exports.cancelClaim = (req, res) => {
  const { name } = req.body;
  const io = req.app.get('io');

  if (name) {
    db.query(
      `UPDATE enemy_faction_members 
       SET claimed_by = NULL
       WHERE name = ?`,
      [name],
      (err) => {
        if (err) {
          console.error('Cancel claim DB error:', err);
          return res.status(500).send('Failed to cancel claim');
        }

        // Fetch updated status and statusUntil
        db.query(
          `SELECT status, timer AS statusUntil
           FROM enemy_faction_members 
           WHERE name = ?`,
          [name],
          (err, results) => {
            if (err || results.length === 0) {
              console.error('Fetch after cancel error:', err);
              return res.redirect('/auth/dashboard');
            }

            const { status, statusUntil } = results[0];


            const room = `faction_${req.session.factionId}`;
            io.to(room).emit('claimUpdate', {
              name,
              claimedBy: null,
              status,
              statusUntil
            });


            res.redirect('/auth/dashboard');
          }
        );
      }
    );
  } else {
    res.redirect('/auth/dashboard');
  }
};

// Logout
exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).send('Logout failed');
    }
    res.clearCookie('connect.sid');
    res.render('login', { error: null });
  });
};
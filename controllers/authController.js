const db = require('../models/db');
const apicalls = require('../calls/apicalls');
const { encrypt, decrypt, isHex } = require('../utils/encryption'); 
let enemyClaims = {}; // In-memory store for claims

// Render login page
exports.getLogin = (req, res) => {
    res.render('login', { error: null });
};

// Handle login form submission
exports.postLogin = async (req, res) => {
  const { api_key } = req.body;
  const pool = req.app.get('pool');

  try {
    const [allowedResults] = await pool.query(
      'SELECT * FROM ALLOWEDFACTION WHERE api_key = ?',
      [api_key]
    );

    if (allowedResults.length === 0) {
      return res.render('login', { error: 'Access Denied' });
    }

    const allowed = allowedResults[0];
    const check = await apicalls.checkApi(api_key);
    const factionid = check.basic.id;

    if (!allowed.factionid || allowed.factionid !== factionid) {
      await pool.query(
        'UPDATE ALLOWEDFACTION SET factionid = ? WHERE api_key = ?',
        [factionid, api_key]
      );
    }

    const basicinfo = await apicalls.basicInfo(api_key);
    const tornid = basicinfo.player_id;
    const playername = basicinfo.name;

    const [userResults] = await pool.query(
      'SELECT * FROM USERS WHERE api_key = ?',
      [api_key]
    );

    if (userResults.length === 0) {
      await pool.query(
        'INSERT INTO USERS (tornid, name, factionid, api_key) VALUES (?, ?, ?, ?)',
        [tornid, playername, factionid, api_key]
      );
    }

    await handleLogin(req, res, playername, factionid, tornid, api_key, pool);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).send('Login error: #aC55');
  }
};


async function handleLogin(req, res, playername, factionid, tornid, apiKey, pool) {
  try {
    await pool.query(
      "DELETE FROM SESSIONS WHERE JSON_EXTRACT(data, '$.apiKey') = ?",
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
    const encryptedKey = req.session.apiKey;
    const apiKey = isHex(encryptedKey) ? decrypt(encryptedKey) : encryptedKey;
    const myFactionId = req.session.factionId;

    const factionMembersRaw = await apicalls.getFactionMembers(apiKey);
    const members = Object.values(factionMembersRaw).map(member => ({
      ...member,
      status: {
        description: member.status?.state || 'Unknown',
        until: member.status?.until ? parseInt(member.status.until, 10) : null
      },
      statusUntil: member.status?.until ? parseInt(member.status.until, 10) : null
    }));

    const rankedWars = await apicalls.getRankedWars(apiKey);
    let selectedWar = rankedWars.find(war => war.winner === null);
    let warType = 'current';

    if (!selectedWar) {
      selectedWar = rankedWars.find(war => war.winner !== null);
      warType = 'last';
    }

    if (!selectedWar) {
      return res.render('dashboard', {
        tornName: req.session.tornName,
        tornId: req.session.tornId,
        factionId: req.session.factionId,
        members,
        enemyMembers: [],
        enemyFactionName: 'No enemy faction found',
        warType
      });
    }

    const enemyFaction = selectedWar.factions.find(f => f.id !== parseInt(myFactionId));
    const enemyFactionId = enemyFaction.id;

    const enemyData = await apicalls.getFactionBasic(apiKey, enemyFactionId);
    const enemyMembersRaw = Object.values(enemyData.members);

    const claims = await new Promise((resolve, reject) => {
      db.query(
        `SELECT name, claimed_by FROM ENEMY_FACTION_MEMBERS 
         WHERE war_type = ? AND war_with_factionid = ?`,
        [warType, myFactionId],
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

    const enemyMembers = enemyMembersRaw.map(member => ({
      name: member.name,
      tornid: member.id,
      factionid: enemyFactionId,
      status: member.status?.state || 'Unknown',
      statusUntil: member.status?.until ? parseInt(member.status.until, 10) : null,
      claimedBy: claims[member.name] || null
    }));

    res.render('dashboard', {
      tornName: req.session.tornName,
      tornId: req.session.tornId,
      factionId: req.session.factionId,
      members,
      enemyMembers,
      enemyFactionName: enemyFaction.name,
      warType
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).send('Failed to load dashboard');
  }
};




// Real-time faction status update
exports.fetchFactionLive = async (req, res) => {


 if (!req.session || !req.session.apiKey) {
 return res.status(401).send('Session expired');
 }

 const encryptedKey = req.session.apiKey;
 const apiKey = isHex(encryptedKey) ? decrypt(encryptedKey) : encryptedKey;
 const myFactionId = req.session.factionId;

  const io = req.app.get('io');

  try {
    const members = await apicalls.getFactionMembers(apiKey);
    const updates = Object.values(members).map(member => {
      const status = member.status?.state || 'Unknown';
      const statusUntil = member.status?.until
        ? parseInt(member.status.until, 10)
        : null;

      return {
        name: member.name,
        tornid: member.id,
        factionid: myFactionId,
        status,
        statusUntil
      };
    });

    updates.forEach(member => {
      db.query(`
        INSERT INTO OUR_FACTION_MEMBERS (
          name, tornid, factionid, laststatus, status_until, war_type, war_with_factionid, changedate
        )
        VALUES (?, ?, ?, ?, ?, 'current', NULL, NOW())
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          laststatus = VALUES(laststatus),
          status_until = VALUES(status_until),
          changedate = NOW()
      `, [
        member.name,
        member.tornid,
        member.factionid,
        member.status,
        member.statusUntil || null
      ], (err) => {
        if (err) console.error('DB insert error (OUR_FACTION_MEMBERS):', err);
      });
    });

    const lastUpdated = Math.floor(Date.now() / 1000);
    io.emit('factionStatusUpdate', { updates, lastUpdated });
    res.sendStatus(200);

  } catch (err) {
    console.error('Faction live update error:', err);
    res.sendStatus(500);
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
        const rankedWars = await apicalls.getRankedWars(apiKey);
        let selectedWar = rankedWars.find(war => war.winner === null);
        let warType = 'current';
        if (!selectedWar) {
            selectedWar = rankedWars.find(war => war.winner !== null);
            warType = 'last';
        }
        if (!selectedWar) {
            console.log('No war found');
            return res.sendStatus(204);
        }

        const enemyFaction = selectedWar.factions.find(f => f.id !== parseInt(myFactionId));
        const enemyFactionId = enemyFaction.id;

        db.query(
            'DELETE FROM ENEMY_FACTION_MEMBERS WHERE war_type = ? AND war_with_factionid = ? AND factionid != ?',
            [warType, myFactionId, enemyFactionId],
            (err) => {
                if (err) console.error('Cleanup error:', err);
            }
        );

        const enemyData = await apicalls.getFactionBasic(apiKey, enemyFactionId);

        const updates = Object.values(enemyData.members).map(member => ({
            name: member.name,
            tornid: member.id,
            factionid: enemyFactionId,
            status: member.status?.state || 'Unknown',
            statusUntil: member.status?.until
        }));

        updates.forEach(member => {
            db.query(`
                INSERT INTO ENEMY_FACTION_MEMBERS (
                    name, tornid, factionid, laststatus, status_until, war_type, war_with_factionid, changedate
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    laststatus = VALUES(laststatus),
                    status_until = VALUES(status_until),
                    war_with_factionid = VALUES(war_with_factionid),
                    changedate = NOW()
            `, [
                member.name,
                member.tornid,
                member.factionid,
                member.status,
                member.statusUntil,
                warType,
                myFactionId
            ], (err) => {
                if (err) console.error('DB insert error:', err);
            });
        });

        const io = req.app.get('io');
        io.emit('enemyStatusUpdate', updates);
        res.sendStatus(200);
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
    'SELECT * FROM ENEMY_FACTION_MEMBERS WHERE name = ? AND war_with_factionid = ?',
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
        'UPDATE ENEMY_FACTION_MEMBERS SET claimed_by = ? WHERE name = ? AND war_with_factionid = ?',
        [claimedBy, name, myFactionId],
        (err) => {
          if (err) {
            console.error('Claim update error:', err);
            return res.status(500).send('Claim update error');
          }

          io.emit('claimUpdate', {
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
      `UPDATE ENEMY_FACTION_MEMBERS 
       SET claimed_by = NULL, claimed_at = NULL 
       WHERE name = ?`,
      [name],
      (err) => {
        if (err) {
          console.error('Cancel claim DB error:', err);
          return res.status(500).send('Failed to cancel claim');
        }

        // Fetch updated status and statusUntil
        db.query(
          `SELECT laststatus AS status, status_until AS statusUntil 
           FROM ENEMY_FACTION_MEMBERS 
           WHERE name = ?`,
          [name],
          (err, results) => {
            if (err || results.length === 0) {
              console.error('Fetch after cancel error:', err);
              return res.redirect('/auth/dashboard');
            }

            const { status, statusUntil } = results[0];

            io.emit('claimUpdate', {
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

const db = require('../models/db');
const apicalls = require('../calls/apicalls');
let enemyClaims = {}; // In-memory store for claims

// Render login page
exports.getLogin = (req, res) => {
    res.render('login', { error: null });
};

// Handle login form submission
exports.postLogin = async (req, res) => {
    const { api_key } = req.body;
    try {
        const allowed = await new Promise((resolve, reject) => {
            db.query('SELECT * FROM allowedfaction WHERE api_key = ?', [api_key], (err, results) => {
                if (err || results.length === 0) {
                    return res.render('login', { error: 'Access Denied' });
                }
                resolve(results[0]);
            });
        });

        const check = await apicalls.checkApi(api_key);
        const factionid = check.basic.id;

        if (!allowed.factionid || allowed.factionid !== factionid) {
            await new Promise((resolve, reject) => {
                db.query('UPDATE allowedfaction SET factionid = ? WHERE api_key = ?', [factionid, api_key], (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        }

        const basicinfo = await apicalls.basicInfo(api_key);
        const tornid = basicinfo.player_id;
        const playername = basicinfo.name;

        const user = await new Promise((resolve, reject) => {
            db.query('SELECT * FROM USERS WHERE api_key = ?', [api_key], (err, results) => {
                if (err) return reject(err);
                resolve(results[0]);
            });
        });

        if (!user) {
            await new Promise((resolve, reject) => {
                db.query('INSERT INTO USERS (tornid, name, factionid, api_key) VALUES (?, ?, ?, ?)', [tornid, playername, factionid, api_key], (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        }

        handleLogin(req, res, playername, factionid, tornid, api_key);
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).send(error.toString());
    }
};

function handleLogin(req, res, playername, factionid, tornid, apiKey) {
    const deleteQuery = "DELETE FROM sessions WHERE JSON_EXTRACT(data, '$.apiKey') = ?";
    db.query(deleteQuery, [apiKey], (err) => {
        if (err) console.error('Error deleting old sessions:', err);
        req.session.tornName = playername;
        req.session.tornId = tornid;
        req.session.factionId = factionid;
        req.session.apiKey = apiKey;
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).send('Session error');
            }
            res.redirect('/auth/dashboard');
        });
    });
}

// Dashboard
exports.getDashboard = async (req, res) => {
    if (!req.session || !req.session.apiKey) {
        return res.redirect('/auth/login');
    }

    try {
        const members = await apicalls.getFactionMembers(req.session.apiKey);
        const rankedWars = await apicalls.getRankedWars(req.session.apiKey);
        const myFactionId = req.session.factionId;

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
        const enemyMembers = await new Promise((resolve, reject) => {
            db.query(
                'SELECT name, tornid, factionid, laststatus AS status, status_until AS statusUntil FROM enemy_faction_members WHERE war_type = ? AND war_with_factionid = ?',
                [warType, myFactionId],
                (err, results) => {
                    if (err) return reject(err);
                    const enriched = results.map(member => ({
                        ...member,
                        claimedBy: enemyClaims[member.name] || null
                    }));
                    resolve(enriched);
                }
            );
        });

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

// Real-time enemy status update
exports.fetchEnemyLive = async (req, res) => {
    const apiKey = req.session.apiKey;
    const myFactionId = req.session.factionId;
    console.log('fetchEnemyLive called');

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
            'DELETE FROM enemy_faction_members WHERE war_type = ? AND war_with_factionid = ? AND factionid != ?',
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
            status: member.status?.description || 'Unknown',
            statusUntil: member.status?.until
                ? Math.floor(new Date(member.status.until).getTime() / 1000)
                : null
        }));

        updates.forEach(member => {
            db.query(`
        INSERT INTO enemy_faction_members (
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
    if (name && req.session.tornName) {
        enemyClaims[name] = req.session.tornName;
    }
    res.redirect('/auth/dashboard');
};

exports.cancelClaim = (req, res) => {
    const { name } = req.body;
    if (name) {
        delete enemyClaims[name];
    }
    res.redirect('/auth/dashboard');
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

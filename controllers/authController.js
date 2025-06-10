
const db = require('../models/db');
const apicalls = require('../calls/apicalls');

// Render login page
exports.getLogin = (req, res) => {
    res.render('login');
};

// Handle login form submission
exports.postLogin = async (req, res) => {
    const { api_key } = req.body;

    try {
        // Check if API key is allowed
        const allowed = await new Promise((resolve, reject) => {
            db.query('SELECT * FROM allowedfaction WHERE api_key = ?', [api_key], (err, results) => {
                if (err || results.length === 0) return reject('Access Denied');
                resolve(results[0]);
            });
        });

        const check = await apicalls.checkApi(api_key);
        const factionid = check.basic.id;

        // Update faction ID if needed
        if (!allowed.factionid || allowed.factionid !== factionid) {
            await new Promise((resolve, reject) => {
                db.query('UPDATE allowedfaction SET factionid = ? WHERE api_key = ?', [factionid, api_key], (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        }

        // Get user info
        const basicinfo = await apicalls.basicInfo(api_key);
        const tornid = basicinfo.player_id;
        const playername = basicinfo.name;

        // Check if user exists
        const user = await new Promise((resolve, reject) => {
            db.query('SELECT * FROM USERS WHERE api_key = ?', [api_key], (err, results) => {
                if (err) return reject(err);
                resolve(results[0]);
            });
        });

        // Create user if not exists
        if (!user) {
            await new Promise((resolve, reject) => {
                db.query('INSERT INTO USERS (tornid, name, factionid, api_key) VALUES (?, ?, ?, ?)', [tornid, playername, factionid, api_key], (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        }

        // Proceed to login
        handleLogin(req, res, playername, factionid, tornid, api_key);

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).send(error.toString());
    }
};

// Helper function to handle session and redirect
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

// Render dashboard
exports.getDashboard = (req, res) => {
    if (!req.session || !req.session.apiKey) {
        return res.redirect('/auth/login');
    }

    res.render('dashboard', {
        apiKey: req.session.apiKey || 'Unknown',
        factionId: req.session.factionId || 'Unknown',
        tornName: req.session.tornName || 'Unknown',
        tornId: req.session.tornId || 'Unknown'
    });
};

// Handle logout
exports.logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).send('Logout failed');
        }
        res.clearCookie('connect.sid');
        res.render('login');
    });
};

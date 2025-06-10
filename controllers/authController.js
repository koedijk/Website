const db = require('../models/db');
const bcrypt = require('bcrypt');
const axios = require('axios');
const apicalls = require('../calls/apicalls');

exports.getLogin = (req, res) => {
    res.render('login');
};

exports.postLogin = (req, res) => {
    var factionid;
    var tornid;
    var playername;
    const { api_key } = req.body;
    const usercheck = 'SELECT * FROM USERS WHERE api_key = ?';    
    const query = 'SELECT * FROM allowedfaction WHERE api_key = ?';
    //Allowedfaction check, starting with only api_key, if correct and factionid is null, update record
    db.query(query, [api_key], async (err, results) => { 
        if (err || results.length == 0) {return res.status(500).send('Access Denied');};
        const checkapi = await apicalls.checkApi(api_key);
        factionid = checkapi.basic.id;
        console.log(results);
        if(results.length >= 1 || results[0].factionid == null || results[0].factionid != factionid)
        {  
            db.query('Update allowedfaction set factionid = ? where api_key = ?',[factionid,api_key], async (err,results) =>{
                if (err) throw err;
            });
            return;
        }
        return;       
    });
    // AllowedFaction is done, now create user :: tornid,name,factionid,apikey
    db.query(usercheck,[api_key], async (err,results) => {
        if (err) throw err;
        const basicinfo = await apicalls.basicInfo(api_key);
        const check = await apicalls.checkApi(api_key);
        factionid = check.basic.id;
        tornid = basicinfo.player_id;
        playername = basicinfo.name;
        console.log(results);
        if(results && results.length > 0)
        {
            handleLogin(req,res,playername,factionid,tornid,api_key);
            console.log('User record is already there');
            return;
        }
        else
        {
            db.query('INSERT INTO USERS (tornid,name,factionid,api_key) VALUES (?,?,?,?)',[tornid,playername,factionid,api_key],async (err,results) =>{

            })
            handleLogin(req,res,playername,factionid,tornid,api_key);
            return;
        }        
    })
};

// Helper function to handle session and redirect
function handleLogin(req, res, playername, factionid, tornid,apiKey ) {
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
            res.redirect('dashboard');
        });
    });
}

exports.getDashboard = (req, res) => {
    if (!req.session || !req.session.userId) {
        console.log('return to login page');
        return res.redirect('/login');
    }
    console.log(req.session);
    res.render('dashboard', {
        apiKey: req.session.apiKey,
        factionId: req.session.factionId,
        tornName: req.session.tornName || 'Unknown',
        tornId: req.session.tornId || 'Unknown'
    });
};

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
exports.ensureAuthenticated = (req, res, next) => {
    if (req.session && req.session.apiKey) {
        return next();
    } else {
        res.redirect('/auth/login');
    }
};

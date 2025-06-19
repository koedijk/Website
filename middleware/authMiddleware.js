exports.ensureAuthenticated = (req, res, next) => {
    if (req.session && req.session.apiKey) {
        console.log(`Worker ${process.pid} is handling session for Torn ID: ${req.session.tornId}`);
        return next();
    } else {
        res.redirect('/auth/login');
    }
};

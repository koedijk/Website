const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { ensureAuthenticated } = require('../middleware/authMiddleware');

// Login page
router.get('/login', authController.getLogin);

// Handle login form submission
router.post('/login', authController.postLogin);

// Logout route
router.get('/logout', authController.logout);
router.post('/logout', authController.logout);

// Protected dashboard route
router.get('/dashboard', ensureAuthenticated, authController.getDashboard);

router.post('/claim', authController.claim);
router.post('/cancel-claim', authController.cancelClaim);


module.exports = router;

const crypto = require('crypto');

if (!process.env.ENCRYPTION_SECRET) {
 throw new Error('ENCRYPTION_SECRET is not defined in environment variables.');
}

const algorithm = 'aes-256-cbc';
const key = crypto.scryptSync(process.env.ENCRYPTION_SECRET, 'salt', 32);
const iv = Buffer.alloc(16, 0); // You can randomize this for more security

function encrypt(text) {
 const cipher = crypto.createCipheriv(algorithm, key, iv);
 let encrypted = cipher.update(text, 'utf8', 'hex');
 encrypted += cipher.final('hex');
 return encrypted;
}

function decrypt(encryptedText) {
 const decipher = crypto.createDecipheriv(algorithm, key, iv);
 let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
 decrypted += decipher.final('utf8');
 return decrypted;
}

function isHex(str) {
 return /^[0-9a-fA-F]+$/.test(str);
}

module.exports = { encrypt, decrypt, isHex };

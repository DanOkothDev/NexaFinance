// Gateway/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    let token;

    // Check if the request contains a Bearer token in the Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Extract token string: "Bearer eyJhbGci..." -> "eyJhbGci..."
            token = req.headers.authorization.split(' ')[1];

            // Decode and verify the token cryptographic signature
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Fetch the user from MongoDB Atlas and attach it to the request object (excluding the password hash)
            req.user = await User.findById(decoded.userId).select('-passwordHash');

            if (!req.user) {
                return res.status(401).json({ error: "User profile linked to token no longer exists." });
            }

            // Move forward to the actual endpoint logic
            return next();

        } catch (error) {
            console.error("JWT validation intercept failure:", error.message);
            return res.status(401).json({ error: "Not authorized. Security token failed verification or has expired." });
        }
    }

    if (!token) {
        return res.status(401).json({ error: "Not authorized. No access token provided in request headers." });
    }
};

module.exports = protect;
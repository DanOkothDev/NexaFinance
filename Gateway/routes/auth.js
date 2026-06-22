const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// USER SIGNUP ENDPOINT
router.post('/signup', async (req, res) => {
    try {
        const { name, email, phoneNumber, password } = req.body;

        // Validation
        if (!name || !email || !phoneNumber || !password) {
            return res.status(400).json({ error: "All account fields are strictly required." });
        }

        // Check if user already exists
        const emailExists = await User.findOne({ email });
        const phoneExists = await User.findOne({ phoneNumber });
        if (emailExists || phoneExists) {
            return res.status(400).json({ error: "An account with this email or phone number already exists." });
        }

        // Hash the secret password securely
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Save to MongoDB Atlas
        const newUser = new User({
            name,
            email,
            phoneNumber,
            passwordHash
        });
        await newUser.save();

        // Mint a secure authentication JSON Web Token
        const token = jwt.sign(
            { userId: newUser._id },
            process.env.JWT_SECRET,
            { expiresIn: '1d' } // Users stay logged in for 1 day
        );

        return res.status(201).json({
            success: true,
            token,
            user: { id: newUser._id, name: newUser.name, email: newUser.email }
        });

    } catch (error) {
        console.error("Signup implementation breakdown:", error.message);
        return res.status(500).json({ error: "Server authentication error during profile execution." });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, error: "Invalid email or password." });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ success: false, error: "Invalid email or password." });
        }

        // Generate JWT Token
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

        return res.status(200).json({
            success: true,
            token,
            user: { id: user._id, name: user.name, email: user.email }
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
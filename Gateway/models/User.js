const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    phoneNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true // Expected format: +2547XXXXXXXX
    },
    passwordHash: {
        type: String,
        required: true
    }
}, {
    timestamps: true 
});

module.exports = mongoose.model('User', UserSchema);
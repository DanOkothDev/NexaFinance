// Gateway/models/Wallet.js
const mongoose = require('mongoose');

const WalletSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    walletName: {
        type: String, // e.g., "M-Pesa", "Equity Bank", "Co-operative Bank"
        required: true
    },
    currentBalance: {
        type: Number,
        required: true,
        default: 0.0
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, { uniqueCompoundIndex: { userId: 1, walletName: 1 } }); // Keeps one record per unique wallet type per user

// Enforce unique compound keys so we don't accidentally create duplicate wallet records
WalletSchema.index({ userId: 1, walletName: 1 }, { unique: true });

module.exports = mongoose.model('Wallet', WalletSchema);
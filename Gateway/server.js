const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const Wallet = require('./models/Wallet');
const protect = require('./middleware/authMiddleware'); 
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Mount authentication and analytics routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);


mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Node.js Gateway connected cleanly to MongoDB Atlas'))
    .catch(err => console.error('CRITICAL: MongoDB connection failed:', err));

// Helper function to handle wallet dynamic balance upserts cleanly
const updateWalletBalance = async (userId, sourceWallet, accountBalance) => {
    if (accountBalance !== null && accountBalance !== undefined) {
        try {
            await Wallet.findOneAndUpdate(
                {
                    userId: userId,
                    walletName: sourceWallet
                },
                {
                    $set: {
                        currentBalance: accountBalance,
                        lastUpdated: new Date()
                    }
                },
                { upsert: true, new: true }
            );
            console.log(`Balance dynamically updated for [${sourceWallet}]: KES ${accountBalance}`);
        } catch (dbErr) {
            console.error(`Failed to update running wallet balance for ${sourceWallet}:`, dbErr.message);
        }
    }
};


// Added 'protect' middleware to identify the authenticated user session automatically
app.post('/api/gateway/ingest', protect, async (req, res) => {
    try {
        if (!req.body) {
            return res.status(400).json({
                error: "Malformed request. Content-Type must be application/json and body must not be empty."
            });
        }

        const { sender, text } = req.body;

        if (!sender || !text) {
            return res.status(400).json({
                error: "Missing required sender or text properties in your JSON payload.",
                received: req.body
            });
        }

        const activeUserId = req.user ? req.user._id : "6a38ee1a00315085b1dbb984"; // Security fallback check
        console.log(`Forwarding live transaction from [${sender}] for user [${activeUserId}] to Python parser...`);

        // Forward payload to FastAPI parser microservice
        const parserResponse = await axios.post(process.env.PARSER_SERVICE_URL, {
            sender,
            text
        });

        const parsedData = parserResponse.data;

        // Execute dynamic balance tracking check hook
        await updateWalletBalance(activeUserId, parsedData.source_wallet, parsedData.account_balance);

        return res.status(200).json({
            success: true,
            message: "Transaction captured and processed successfully.",
            data: parsedData
        });

    } catch (error) {
        console.error("Gateway routing breakdown:", error.message);
        return res.status(500).json({
            error: "Internal data gateway proxy failed to process transaction.",
            details: error.response?.data || error.message
        });
    }
});


app.post('/api/gateway/sync-history', protect, async (req, res) => {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: "Invalid payload. 'messages' must be an array." });
        }

        const activeUserId = req.user ? req.user._id : "6a38ee1a00315085b1dbb984";
        console.log(`Processing batch synchronization for ${messages.length} historical messages...`);

        const parsedResults = [];

        // Loop through and sync entire historical log sequentially
        for (const msg of messages) {
            try {
                const parserResponse = await axios.post(process.env.PARSER_SERVICE_URL, {
                    sender: msg.sender,
                    text: msg.text
                });

                const parsedData = parserResponse.data;
                parsedResults.push(parsedData);

                // Dynamically update or create wallets as we loop through history.
                // Because loops run forward in time, the last message processed sets the current balance.
                await updateWalletBalance(activeUserId, parsedData.source_wallet, parsedData.account_balance);

            } catch (err) {
                console.error(`Skipped a corrupted message from ${msg.sender}:`, err.message);
            }
        }

        return res.status(200).json({
            success: true,
            synced_records: parsedResults.length,
            message: "Historical account synchronization and balance hydration complete.",
            data: parsedResults
        });

    } catch (error) {
        console.error("Batch history sync failed:", error.message);
        return res.status(500).json({ error: "Failed to initialize historical account hydration." });
    }
});


app.get('/health', (req, res) => {
    res.status(200).json({ status: "Gateway Operational", timestamp: new Date() });
});


app.listen(PORT, () => {
    console.log(`NexaFinance Gateway running locally on port ${PORT}`);
});
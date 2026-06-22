const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const protect = require('../middleware/authMiddleware');
const Wallet = require('../models/Wallet'); // Import the Wallet model

// SECURE ENDPOINT: Fetches live dynamic data based on the verified JWT session
router.get('/summary', protect, async (req, res) => {
    try {
        const userIdObj = req.user._id; // Mongoose ObjectId
        const userIdStr = userIdObj.toString(); // Plain text string for the transaction query match
        const db = mongoose.connection.db;

        // 1. FETCH DYNAMIC WALLET BALANCES FOR NET WORTH ACCUMULATION
        const activeWallets = await Wallet.find({ userId: userIdObj });

        // Calculate real-time Net Worth by summing up the active wallet states dynamically
        const totalNetWorth = activeWallets.reduce((accumulator, wallet) => {
            return accumulator + wallet.currentBalance;
        }, 0);

        // 2. RUN AGGREGATION FOR SPEND INTELLIGENCE & RECENT GLOBAL FEED IN A SINGLE PASS
        const stats = await db.collection('transactions').aggregate([
            { $match: { user_id: userIdStr } },
            {
                $facet: {
                    // Group expenses by category for the pie chart breakdown
                    categorySpending: [
                        { $match: { transaction_type: { $in: ["Transfer", "debit", "Withdrawal"] } } },
                        {
                            $group: {
                                _id: "$category",
                                totalSpent: { $sum: "$amount" }
                            }
                        }
                    ],
                    // Extract the 5 most recent activities for the stream overview panel
                    recentFeed: [
                        { $sort: { created_at: -1 } },
                        { $limit: 5 },
                        {
                            $project: {
                                _id: 0,
                                transaction_code: 1,
                                source_wallet: 1,
                                destination_entity: 1,
                                amount: 1,
                                transaction_type: 1,
                                category: 1,
                                created_at: 1
                            }
                        }
                    ]
                }
            }
        ]).toArray();

        const aggregationResults = stats[0] || { categorySpending: [], recentFeed: [] };

        // 3. ASSEMBLE PRODUCTION-READY TELEMETRY PAYLOAD
        return res.status(200).json({
            success: true,
            user: {
                name: req.user.name,
                email: req.user.email
            },
            dashboard: {
                total_net_worth: totalNetWorth,
                currency: "KES",
                linked_wallets: activeWallets.map(wallet => ({
                    wallet_name: wallet.walletName,
                    current_balance: wallet.currentBalance,
                    last_synced: wallet.lastUpdated
                })),
                spend_intelligence: aggregationResults.categorySpending,
                recent_activity: aggregationResults.recentFeed
            }
        });

    } catch (error) {
        console.error("Dashboard secure calculation failure:", error.message);
        return res.status(500).json({ error: "Failed to assemble secured dashboard metrics." });
    }
});

module.exports = router;
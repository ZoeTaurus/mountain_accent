// ═══════════════════════════════════════════════════════════════════════════════
// Mountain Ascent - Race Mode WebSocket Server
// ═══════════════════════════════════════════════════════════════════════════════
//
// Simple Node.js WebSocket server for race matchmaking
//
// Installation:
//   npm install ws
//
// Usage:
//   node server.js
//
// The server will run on ws://localhost:8080
// ═══════════════════════════════════════════════════════════════════════════════

const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const MATCHMAKING_TIMEOUT = 15000; // 15 seconds

// Server state
const server = new WebSocket.Server({ port: PORT });
const players = new Map(); // playerId -> { ws, state, matchId }
const matchmakingQueue = []; // Array of playerIds waiting for match
const matches = new Map(); // matchId -> { player1, player2, seed, startTime }

console.log(`Race server running on ws://localhost:${PORT}`);

// Generate unique match ID
function generateMatchId() {
    return 'match_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Generate random terrain seed
function generateSeed() {
    return Math.floor(Math.random() * 1000000);
}

// Send message to player
function sendToPlayer(playerId, message) {
    const player = players.get(playerId);
    if (player && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(JSON.stringify(message));
    }
}

// Remove player from matchmaking queue
function removeFromQueue(playerId) {
    const index = matchmakingQueue.indexOf(playerId);
    if (index !== -1) {
        matchmakingQueue.splice(index, 1);
    }
}

// Find opponent for player
function findMatch(playerId) {
    // Look for another player in queue
    for (let i = 0; i < matchmakingQueue.length; i++) {
        const opponentId = matchmakingQueue[i];
        if (opponentId !== playerId) {
            // Found a match!
            matchmakingQueue.splice(i, 1);
            removeFromQueue(playerId);

            const matchId = generateMatchId();
            const seed = generateSeed();

            // Create match
            const match = {
                player1: playerId,
                player2: opponentId,
                seed: seed,
                startTime: Date.now()
            };
            matches.set(matchId, match);

            // Update player states
            const player1 = players.get(playerId);
            const player2 = players.get(opponentId);
            if (player1) player1.matchId = matchId;
            if (player2) player2.matchId = matchId;

            // Notify both players
            const matchMessage = {
                type: 'MATCH_FOUND',
                matchId: matchId,
                seed: seed
            };

            sendToPlayer(playerId, matchMessage);
            sendToPlayer(opponentId, matchMessage);

            console.log(`Match created: ${matchId} between ${playerId} and ${opponentId}`);
            return true;
        }
    }

    // No match found, add to queue and keep searching
    if (!matchmakingQueue.includes(playerId)) {
        matchmakingQueue.push(playerId);
        console.log(`Player ${playerId} added to matchmaking queue. Queue size: ${matchmakingQueue.length}`);
        // No timeout - keep searching indefinitely until opponent found or player cancels
    }

    return false;
}

// Handle player disconnection
function handleDisconnect(playerId) {
    const player = players.get(playerId);
    if (!player) return;

    // Remove from queue
    removeFromQueue(playerId);

    // Notify opponent if in match
    if (player.matchId) {
        const match = matches.get(player.matchId);
        if (match) {
            const opponentId = match.player1 === playerId ? match.player2 : match.player1;
            sendToPlayer(opponentId, { type: 'OPPONENT_DISCONNECTED' });
            matches.delete(player.matchId);
            console.log(`Match ${player.matchId} ended due to disconnect`);
        }
    }

    players.delete(playerId);
    console.log(`Player ${playerId} disconnected. Active players: ${players.size}`);
}

// WebSocket connection handler
server.on('connection', (ws) => {
    let playerId = null;

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);

            switch (message.type) {
                case 'FIND_MATCH':
                    playerId = message.playerId;
                    players.set(playerId, { ws, state: null, matchId: null });
                    console.log(`Player ${playerId} connected. Active players: ${players.size}`);
                    findMatch(playerId);
                    break;

                case 'CANCEL_MATCHMAKING':
                    if (playerId) {
                        removeFromQueue(playerId);
                        console.log(`Player ${playerId} cancelled matchmaking`);
                    }
                    break;

                case 'STATE_UPDATE':
                    if (playerId) {
                        const player = players.get(playerId);
                        if (player && player.matchId) {
                            const match = matches.get(player.matchId);
                            if (match) {
                                // Forward state to opponent
                                const opponentId = match.player1 === playerId ? match.player2 : match.player1;
                                sendToPlayer(opponentId, {
                                    type: 'OPPONENT_STATE',
                                    state: message.state
                                });
                            }
                        }
                    }
                    break;

                case 'CRASHED':
                    if (playerId) {
                        const player = players.get(playerId);
                        if (player && player.matchId) {
                            const match = matches.get(player.matchId);
                            if (match) {
                                const opponentId = match.player1 === playerId ? match.player2 : match.player1;
                                // Notify opponent that this player crashed
                                sendToPlayer(opponentId, {
                                    type: 'OPPONENT_STATE',
                                    state: { crashed: true, distance: message.distance }
                                });
                            }
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        if (playerId) {
            handleDisconnect(playerId);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        if (playerId) {
            handleDisconnect(playerId);
        }
    });
});

// Cleanup stale matches periodically
setInterval(() => {
    const now = Date.now();
    const maxMatchDuration = 10 * 60 * 1000; // 10 minutes

    for (const [matchId, match] of matches) {
        if (now - match.startTime > maxMatchDuration) {
            // Clean up stale match
            const player1 = players.get(match.player1);
            const player2 = players.get(match.player2);
            if (player1) player1.matchId = null;
            if (player2) player2.matchId = null;
            matches.delete(matchId);
            console.log(`Cleaned up stale match: ${matchId}`);
        }
    }
}, 60000); // Run every minute

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

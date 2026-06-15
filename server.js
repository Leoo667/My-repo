const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fileUpload = require('express-fileupload');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(express.static(__dirname));
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 },
    useTempFiles: false
}));

// Store rooms in memory
const rooms = new Map();
const roomMessages = new Map();
const roomUsers = new Map();

// Helper: Generate random avatar color
function getAvatarColor(name) {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#F0E68C', '#FFB6C1', '#98D8C8', '#F7D794'];
    const index = name.length % colors.length;
    return colors[index];
}

// Helper: Get avatar initial
function getAvatarInitial(name) {
    return name.charAt(0).toUpperCase();
}

// Helper: Generate random nickname
function generateNickname() {
    const names = ['ShadowFox', 'NeonWolf', 'CyberBird', 'PhantomTiger', 'ElectricEagle', 'CryptoHawk', 'GhostPanther', 'DigitalDragon', 'MysticRaven', 'StealthViper', 'QuantumFalcon', 'EchoWolf', 'NeonRaven', 'PhantomLynx', 'CyberOwl'];
    const randomNum = Math.floor(Math.random() * 1000);
    return names[Math.floor(Math.random() * names.length)] + randomNum;
}

io.on('connection', (socket) => {
    console.log('✅ New client connected:', socket.id);
    let currentRoom = null;
    let currentUser = null;

    // Join room
    socket.on('join-room', (data) => {
        const { roomCode, username, isGhost } = data;
        
        if (!roomCode || roomCode.length < 3) {
            socket.emit('error', 'Room code must be at least 3 characters');
            return;
        }

        // Leave previous room
        if (currentRoom) {
            socket.leave(currentRoom);
            const users = roomUsers.get(currentRoom);
            if (users) {
                users.delete(socket.id);
                io.to(currentRoom).emit('user-count', users.size);
                io.to(currentRoom).emit('users-list', Array.from(users.values()));
            }
        }

        currentRoom = roomCode;
        socket.join(roomCode);

        // Create room if not exists
        if (!rooms.has(roomCode)) {
            rooms.set(roomCode, {
                createdAt: Date.now(),
                expiryTime: Date.now() + 60 * 60 * 1000,
                locked: false,
                ended: false
            });
            roomMessages.set(roomCode, []);
            roomUsers.set(roomCode, new Map());
        }

        // Check if room ended
        const room = rooms.get(roomCode);
        if (room.ended) {
            socket.emit('error', 'This chat session has ended');
            return;
        }

        // Create user
        const displayName = username && username.trim() ? username.trim() : generateNickname();
        currentUser = {
            id: socket.id,
            name: displayName,
            isGhost: isGhost || false,
            avatarColor: getAvatarColor(displayName),
            avatarInitial: getAvatarInitial(displayName),
            joinedAt: Date.now()
        };

        // Add to room
        roomUsers.get(roomCode).set(socket.id, currentUser);

        // Send current messages to user
        socket.emit('room-joined', {
            roomCode: roomCode,
            user: currentUser,
            messages: roomMessages.get(roomCode) || [],
            userCount: roomUsers.get(roomCode).size,
            users: Array.from(roomUsers.get(roomCode).values()),
            roomExpiry: room.expiryTime
        });

        // Broadcast to others
        socket.to(roomCode).emit('user-joined', {
            user: currentUser,
            userCount: roomUsers.get(roomCode).size,
            users: Array.from(roomUsers.get(roomCode).values())
        });

        io.to(roomCode).emit('user-count', roomUsers.get(roomCode).size);
        socket.to(roomCode).emit('play-sound', 'join');
    });

    // Send text message
    socket.on('send-message', (data) => {
        if (!currentRoom || !currentUser) return;
        
        const room = rooms.get(currentRoom);
        if (room && room.ended) {
            socket.emit('error', 'Chat has ended');
            return;
        }

        const { message, selfDestruct } = data;
        
        const cleanMessage = message.replace(/[<>]/g, '').substring(0, 500);
        
        const messageData = {
            id: Date.now() + Math.random(),
            userId: currentUser.id,
            userName: currentUser.isGhost ? '👻 Anonymous' : currentUser.name,
            userAvatar: currentUser.avatarInitial,
            userColor: currentUser.avatarColor,
            message: cleanMessage,
            timestamp: Date.now(),
            time: new Date().toLocaleTimeString(),
            selfDestruct: selfDestruct || null,
            type: 'text'
        };

        const messages = roomMessages.get(currentRoom) || [];
        messages.push(messageData);
        roomMessages.set(currentRoom, messages);

        io.to(currentRoom).emit('new-message', messageData);
        io.to(currentRoom).emit('play-sound', 'message');

        if (selfDestruct && selfDestruct > 0) {
            setTimeout(() => {
                const msgs = roomMessages.get(currentRoom);
                if (msgs) {
                    const index = msgs.findIndex(m => m.id === messageData.id);
                    if (index !== -1) {
                        msgs.splice(index, 1);
                        io.to(currentRoom).emit('message-deleted', messageData.id);
                    }
                }
            }, selfDestruct);
        }

        if (messages.length > 200) {
            messages.splice(0, messages.length - 200);
        }
    });

    // Send voice message
    socket.on('voice-message', (data) => {
        if (!currentRoom || !currentUser) return;
        
        const room = rooms.get(currentRoom);
        if (room && room.ended) return;
        
        const voiceData = {
            id: Date.now() + Math.random(),
            userId: currentUser.id,
            userName: currentUser.isGhost ? '👻 Anonymous' : currentUser.name,
            userAvatar: currentUser.avatarInitial,
            userColor: currentUser.avatarColor,
            audioData: data.audioData,
            duration: data.duration,
            timestamp: Date.now(),
            time: new Date().toLocaleTimeString(),
            type: 'voice'
        };
        
        const messages = roomMessages.get(currentRoom) || [];
        messages.push(voiceData);
        roomMessages.set(currentRoom, messages);
        
        io.to(currentRoom).emit('voice-message', voiceData);
        io.to(currentRoom).emit('play-sound', 'message');
    });

    // Send file (image/video/document)
    socket.on('file-upload', (data) => {
        if (!currentRoom || !currentUser) return;
        
        const room = rooms.get(currentRoom);
        if (room && room.ended) return;
        
        const fileData = {
            id: Date.now() + Math.random(),
            userId: currentUser.id,
            userName: currentUser.isGhost ? '👻 Anonymous' : currentUser.name,
            userAvatar: currentUser.avatarInitial,
            userColor: currentUser.avatarColor,
            fileName: data.fileName,
            fileType: data.fileType,
            fileSize: data.fileSize,
            fileData: data.fileData,
            timestamp: Date.now(),
            time: new Date().toLocaleTimeString(),
            type: 'file'
        };
        
        const messages = roomMessages.get(currentRoom) || [];
        messages.push(fileData);
        roomMessages.set(currentRoom, messages);
        
        io.to(currentRoom).emit('new-file', fileData);
        io.to(currentRoom).emit('play-sound', 'message');
        
        if (messages.length > 200) {
            messages.splice(0, messages.length - 200);
        }
    });

    // Typing indicator
    socket.on('typing', (isTyping) => {
        if (!currentRoom || !currentUser || currentUser.isGhost) return;
        socket.to(currentRoom).emit('user-typing', {
            userName: currentUser.name,
            isTyping: isTyping
        });
    });

    // Reaction
    socket.on('reaction', (data) => {
        if (!currentRoom) return;
        io.to(currentRoom).emit('reaction-flash', {
            messageId: data.messageId,
            emoji: data.emoji,
            userName: currentUser ? currentUser.name : 'Someone'
        });
    });

    // End chat
    socket.on('end-chat', () => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (room) {
            room.ended = true;
            roomMessages.set(currentRoom, []);
            io.to(currentRoom).emit('chat-ended');
            
            setTimeout(() => {
                rooms.delete(currentRoom);
                roomMessages.delete(currentRoom);
                roomUsers.delete(currentRoom);
                console.log(`🗑️ Room ${currentRoom} permanently deleted`);
            }, 5000);
        }
    });

    // Panic mode
    socket.on('panic-mode', () => {
        if (!currentRoom) return;
        roomMessages.set(currentRoom, []);
        io.to(currentRoom).emit('panic-activate');
        io.to(currentRoom).emit('messages-cleared');
        io.to(currentRoom).emit('play-sound', 'panic');
    });

    // Disconnect
    socket.on('disconnect', () => {
        if (currentRoom && currentUser) {
            const users = roomUsers.get(currentRoom);
            if (users) {
                users.delete(socket.id);
                io.to(currentRoom).emit('user-left', {
                    userId: currentUser.id,
                    userName: currentUser.name,
                    userCount: users.size
                });
                io.to(currentRoom).emit('user-count', users.size);
                io.to(currentRoom).emit('users-list', Array.from(users.values()));
            }

            if (users && users.size === 0) {
                const room = rooms.get(currentRoom);
                if (room && !room.ended) {
                    setTimeout(() => {
                        const checkUsers = roomUsers.get(currentRoom);
                        if (checkUsers && checkUsers.size === 0) {
                            rooms.delete(currentRoom);
                            roomMessages.delete(currentRoom);
                            roomUsers.delete(currentRoom);
                            console.log(`🗑️ Room ${currentRoom} deleted (empty)`);
                        }
                    }, 30000);
                }
            }
        }
        console.log('❌ Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('========================================');
    console.log('🎉 CHATFLOW PREMIUM SERVER RUNNING');
    console.log(`🌐 Open http://localhost:${PORT}`);
    console.log('========================================');
});
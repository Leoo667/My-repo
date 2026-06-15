// Socket connection
const socket = io();

// Global variables
let currentRoom = null;
let currentUser = null;
let currentSelfDestruct = 0;
let typingTimeout = null;
let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;
let soundEnabled = true;
let isDarkTheme = true;

// DOM Elements
const joinContainer = document.getElementById('joinContainer');
const chatContainer = document.getElementById('chatContainer');
const roomCodeInput = document.getElementById('roomCode');
const usernameInput = document.getElementById('username');
const ghostModeCheck = document.getElementById('ghostMode');
const joinBtn = document.getElementById('joinBtn');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const userCountSpan = document.getElementById('userCount');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const typingIndicator = document.getElementById('typingIndicator');
const panicBtn = document.getElementById('panicBtn');
const endChatBtn = document.getElementById('endChatBtn');
const themeToggle = document.getElementById('themeToggle');
const soundToggle = document.getElementById('soundToggle');
const voiceBtn = document.getElementById('voiceBtn');
const fileBtn = document.getElementById('fileBtn');
const fileInput = document.getElementById('fileInput');
const voiceRecordingDiv = document.getElementById('voiceRecording');
const recordingTimeSpan = document.getElementById('recordingTime');
const stopRecordingBtn = document.getElementById('stopRecordingBtn');
const timerSpan = document.getElementById('timer');

// Audio for sounds
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// Play sound function
function playSound(type) {
    if (!soundEnabled) return;
    
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        let frequency = 660;
        let duration = 0.2;
        
        switch(type) {
            case 'join':
                frequency = 880;
                break;
            case 'message':
                frequency = 660;
                break;
            case 'panic':
                frequency = 220;
                duration = 0.5;
                break;
        }
        
        oscillator.frequency.value = frequency;
        gainNode.gain.value = 0.1;
        
        oscillator.start();
        setTimeout(() => {
            oscillator.stop();
        }, duration * 1000);
    } catch(e) {
        console.log('Audio not supported');
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.display = 'block';
    
    const colors = {
        success: '#00d2d3',
        error: '#ff4757',
        warning: '#ffa502',
        info: '#1e272e'
    };
    
    toast.style.background = colors[type] || colors.info;
    
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Display text message
function displayMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.setAttribute('data-id', message.id);
    
    if (message.userId === socket.id) {
        messageDiv.classList.add('own');
    }
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <div class="message-avatar" style="background: ${message.userColor}">
                ${escapeHtml(message.userAvatar)}
            </div>
            <span class="message-name">${escapeHtml(message.userName)}</span>
            <span class="message-time">${message.time}</span>
        </div>
        <div class="message-text">${escapeHtml(message.message)}</div>
        <div class="reactions">
            <span class="reaction-emoji" data-emoji="👍">👍</span>
            <span class="reaction-emoji" data-emoji="❤️">❤️</span>
            <span class="reaction-emoji" data-emoji="😂">😂</span>
            <span class="reaction-emoji" data-emoji="😮">😮</span>
            <span class="reaction-emoji" data-emoji="😢">😢</span>
        </div>
    `;
    
    messagesDiv.appendChild(messageDiv);
    messageDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
    
    messageDiv.querySelectorAll('.reaction-emoji').forEach(emoji => {
        emoji.addEventListener('click', () => {
            socket.emit('reaction', {
                messageId: message.id,
                emoji: emoji.dataset.emoji
            });
        });
    });
}

// Display voice message
function displayVoiceMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.setAttribute('data-id', message.id);
    
    if (message.userId === socket.id) {
        messageDiv.classList.add('own');
    }
    
    let isPlaying = false;
    let audioElement = null;
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <div class="message-avatar" style="background: ${message.userColor}">
                ${escapeHtml(message.userAvatar)}
            </div>
            <span class="message-name">${escapeHtml(message.userName)}</span>
            <span class="message-time">${message.time}</span>
        </div>
        <div class="voice-message">
            <button class="voice-play-btn">▶️</button>
            <div class="voice-wave">
                <span></span><span></span><span></span><span></span><span></span>
            </div>
            <span class="voice-duration">${message.duration}s</span>
        </div>
        <div class="reactions">
            <span class="reaction-emoji" data-emoji="👍">👍</span>
            <span class="reaction-emoji" data-emoji="❤️">❤️</span>
            <span class="reaction-emoji" data-emoji="😂">😂</span>
            <span class="reaction-emoji" data-emoji="😮">😮</span>
            <span class="reaction-emoji" data-emoji="😢">😢</span>
        </div>
    `;
    
    const playBtn = messageDiv.querySelector('.voice-play-btn');
    const waveBars = messageDiv.querySelectorAll('.voice-wave span');
    
    playBtn.addEventListener('click', () => {
        if (isPlaying && audioElement) {
            audioElement.pause();
            audioElement.currentTime = 0;
            isPlaying = false;
            playBtn.textContent = '▶️';
            waveBars.forEach(bar => bar.style.animation = 'none');
        } else {
            const audio = new Audio(message.audioData);
            audioElement = audio;
            audio.play();
            isPlaying = true;
            playBtn.textContent = '⏸️';
            waveBars.forEach(bar => bar.style.animation = 'wave 1s infinite');
            
            audio.onended = () => {
                isPlaying = false;
                playBtn.textContent = '▶️';
                waveBars.forEach(bar => bar.style.animation = 'none');
            };
        }
    });
    
    messagesDiv.appendChild(messageDiv);
    messageDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
    
    messageDiv.querySelectorAll('.reaction-emoji').forEach(emoji => {
        emoji.addEventListener('click', () => {
            socket.emit('reaction', {
                messageId: message.id,
                emoji: emoji.dataset.emoji
            });
        });
    });
}

// Display file message
function displayFileMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.setAttribute('data-id', message.id);
    
    if (message.userId === socket.id) {
        messageDiv.classList.add('own');
    }
    
    let preview = '';
    const fileData = message.fileData;
    
    if (message.fileType.startsWith('image/')) {
        preview = `<img src="${fileData}" class="file-preview" alt="${escapeHtml(message.fileName)}" style="max-width: 200px; max-height: 200px; border-radius: 10px; cursor: pointer;" onclick="window.open(this.src)">`;
    }
    else if (message.fileType.startsWith('video/')) {
        preview = `<video controls class="file-preview" style="max-width: 200px; max-height: 200px; border-radius: 10px;">
                    <source src="${fileData}" type="${message.fileType}">
                    Your browser does not support video.
                   </video>`;
    }
    else {
        const fileIcon = message.fileType.includes('pdf') ? '📕' : 
                        message.fileType.includes('word') ? '📘' : '📄';
        preview = `<div class="file-info">
                    ${fileIcon} ${escapeHtml(message.fileName)} (${formatFileSize(message.fileSize)})
                    <a href="${fileData}" download="${escapeHtml(message.fileName)}" class="file-download">Download</a>
                   </div>`;
    }
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <div class="message-avatar" style="background: ${message.userColor}">
                ${escapeHtml(message.userAvatar)}
            </div>
            <span class="message-name">${escapeHtml(message.userName)}</span>
            <span class="message-time">${message.time}</span>
        </div>
        <div class="message-text">
            ${preview}
        </div>
        <div class="reactions">
            <span class="reaction-emoji" data-emoji="👍">👍</span>
            <span class="reaction-emoji" data-emoji="❤️">❤️</span>
            <span class="reaction-emoji" data-emoji="😂">😂</span>
            <span class="reaction-emoji" data-emoji="😮">😮</span>
            <span class="reaction-emoji" data-emoji="😢">😢</span>
        </div>
    `;
    
    messagesDiv.appendChild(messageDiv);
    messageDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
    
    messageDiv.querySelectorAll('.reaction-emoji').forEach(emoji => {
        emoji.addEventListener('click', () => {
            socket.emit('reaction', {
                messageId: message.id,
                emoji: emoji.dataset.emoji
            });
        });
    });
}

// Show reaction flash
function showReactionFlash(emoji) {
    const flash = document.createElement('div');
    flash.className = 'reaction-flash';
    flash.textContent = emoji;
    document.body.appendChild(flash);
    
    setTimeout(() => {
        flash.remove();
    }, 2000);
}

// Update timer
function updateTimer(expiryTime) {
    const interval = setInterval(() => {
        const now = Date.now();
        const diff = expiryTime - now;
        
        if (diff <= 0) {
            clearInterval(interval);
            timerSpan.textContent = '00:00';
            showToast('Chat session has ended!', 'error');
            setTimeout(() => {
                location.reload();
            }, 3000);
            return;
        }
        
        const minutes = Math.floor(diff / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        timerSpan.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
}

// Join room
joinBtn.addEventListener('click', () => {
    const roomCode = roomCodeInput.value.trim();
    const username = usernameInput.value.trim();
    const isGhost = ghostModeCheck.checked;
    
    if (roomCode.length < 3) {
        showToast('Room code must be at least 3 characters', 'error');
        return;
    }
    
    socket.emit('join-room', { roomCode, username, isGhost });
});

// Send message
function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;
    
    socket.emit('send-message', {
        message: message,
        selfDestruct: currentSelfDestruct
    });
    
    messageInput.value = '';
    messageInput.focus();
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
    handleTyping();
});

// Typing handler
function handleTyping() {
    socket.emit('typing', true);
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('typing', false);
    }, 1000);
}

// Self-destruct buttons
document.querySelectorAll('.sd-option').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.sd-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSelfDestruct = parseInt(btn.dataset.time);
    });
});

// File upload
fileBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 50 * 1024 * 1024) {
        showToast('File too large! Max 50MB', 'error');
        return;
    }
    
    showToast(`Uploading ${file.name}...`, 'info');
    
    const reader = new FileReader();
    reader.onload = (event) => {
        socket.emit('file-upload', {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            fileData: event.target.result
        });
        showToast(`File "${file.name}" sent!`, 'success');
    };
    reader.onerror = () => {
        showToast('Error reading file', 'error');
    };
    reader.readAsDataURL(file);
    
    fileInput.value = '';
});

// Voice recording
let isRecording = false;

voiceBtn.addEventListener('mousedown', startRecording);
voiceBtn.addEventListener('mouseup', stopRecording);
voiceBtn.addEventListener('mouseleave', stopRecording);
stopRecordingBtn.addEventListener('click', stopRecording);

function startRecording() {
    if (isRecording) return;
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const reader = new FileReader();
                
                reader.onloadend = () => {
                    socket.emit('voice-message', {
                        audioData: reader.result,
                        duration: recordingSeconds
                    });
                    showToast('Voice message sent!', 'success');
                };
                
                reader.readAsDataURL(audioBlob);
                stream.getTracks().forEach(track => track.stop());
                
                voiceRecordingDiv.style.display = 'none';
                voiceBtn.classList.remove('recording');
                clearInterval(recordingTimer);
                isRecording = false;
            };
            
            mediaRecorder.start();
            isRecording = true;
            recordingSeconds = 0;
            
            voiceRecordingDiv.style.display = 'flex';
            voiceBtn.classList.add('recording');
            recordingTimeSpan.textContent = '0';
            
            recordingTimer = setInterval(() => {
                recordingSeconds++;
                recordingTimeSpan.textContent = recordingSeconds;
                if (recordingSeconds >= 60) {
                    stopRecording();
                }
            }, 1000);
        })
        .catch(err => {
            showToast('Microphone access denied', 'error');
        });
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
    }
}

// Panic mode
panicBtn.addEventListener('click', () => {
    const chatGlass = document.querySelector('.chat-glass');
    chatGlass.classList.add('panic-active');
    socket.emit('panic-mode');
    
    setTimeout(() => {
        chatGlass.classList.remove('panic-active');
    }, 3000);
    
    showToast('⚠️ Panic mode activated! Chat blurred', 'warning');
    playSound('panic');
});

// End chat
endChatBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to end this chat? All messages will be permanently deleted.')) {
        socket.emit('end-chat');
        showToast('🏁 Chat ended! Redirecting...', 'warning');
    }
});

// Theme toggle
themeToggle.addEventListener('click', () => {
    isDarkTheme = !isDarkTheme;
    document.body.classList.toggle('light-mode', !isDarkTheme);
    themeToggle.textContent = isDarkTheme ? '🌙' : '☀️';
});

// Sound toggle
soundToggle.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    soundToggle.textContent = soundEnabled ? '🔊' : '🔇';
    showToast(soundEnabled ? 'Sound on' : 'Sound off', 'info');
});

// Screenshot protection
document.addEventListener('keydown', (e) => {
    if (e.key === 'PrintScreen') {
        e.preventDefault();
        showToast('📸 Screenshots are disabled in ChatFlow', 'warning');
        return false;
    }
    
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'p')) {
        e.preventDefault();
        showToast('Saving/Printing is disabled', 'warning');
        return false;
    }
});

// Socket events
socket.on('room-joined', (data) => {
    currentRoom = data.roomCode;
    currentUser = data.user;
    
    roomCodeDisplay.textContent = data.roomCode;
    userCountSpan.querySelector('span:last-child').textContent = data.userCount;
    
    messagesDiv.innerHTML = '';
    data.messages.forEach(msg => {
        if (msg.type === 'voice') {
            displayVoiceMessage(msg);
        } else if (msg.type === 'file') {
            displayFileMessage(msg);
        } else {
            displayMessage(msg);
        }
    });
    
    joinContainer.style.display = 'none';
    chatContainer.style.display = 'block';
    
    updateTimer(data.roomExpiry);
    showToast(`Joined as ${data.user.name}`, 'success');
    playSound('join');
    
    messageInput.focus();
});

socket.on('new-message', (message) => {
    displayMessage(message);
    playSound('message');
});

socket.on('voice-message', (message) => {
    displayVoiceMessage(message);
    playSound('message');
});

socket.on('new-file', (message) => {
    displayFileMessage(message);
    playSound('message');
});

socket.on('user-joined', (data) => {
    userCountSpan.querySelector('span:last-child').textContent = data.userCount;
    showToast(`${data.user.name} joined the room`, 'info');
    playSound('join');
});

socket.on('user-left', (data) => {
    userCountSpan.querySelector('span:last-child').textContent = data.userCount;
    showToast(`${data.userName} left the room`, 'info');
});

socket.on('user-count', (count) => {
    userCountSpan.querySelector('span:last-child').textContent = count;
});

socket.on('user-typing', (data) => {
    if (data.isTyping) {
        typingIndicator.textContent = `${data.userName} is typing...`;
        setTimeout(() => {
            if (typingIndicator.textContent === `${data.userName} is typing...`) {
                typingIndicator.textContent = '';
            }
        }, 2000);
    } else {
        typingIndicator.textContent = '';
    }
});

socket.on('reaction-flash', (data) => {
    showReactionFlash(data.emoji);
    showToast(`${data.userName} reacted with ${data.emoji}`, 'info');
});

socket.on('panic-activate', () => {
    const chatGlass = document.querySelector('.chat-glass');
    chatGlass.classList.add('panic-active');
    setTimeout(() => {
        chatGlass.classList.remove('panic-active');
    }, 3000);
    showToast('🔥 Panic mode activated by someone!', 'warning');
});

socket.on('messages-cleared', () => {
    messagesDiv.innerHTML = '';
    showToast('All messages have been cleared!', 'info');
});

socket.on('chat-ended', () => {
    messagesDiv.innerHTML = '';
    showToast('🏁 This chat session has ended. Redirecting...', 'error');
    setTimeout(() => {
        location.reload();
    }, 3000);
});

socket.on('play-sound', (type) => {
    playSound(type);
});

socket.on('error', (error) => {
    showToast(error, 'error');
});

console.log('ChatFlow Premium loaded successfully!');
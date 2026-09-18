// wifi-transfer.js - Ultra-fast Wi-Fi Direct (WebRTC) & Real-time Room Sync Data Transfer
// Enables seamless phone-to-PC & student file/photo/text sharing with zero app installation.

class WifiDataTransferManager {
    constructor() {
        this.roomCode = this.resolveRoomCode();
        this.myDeviceId = 'dev_' + Math.random().toString(36).substring(2, 9);
        this.myDeviceName = localStorage.getItem('mks_wifi_dev_name') || this.detectDeviceDefaultName();
        this.deviceType = this.detectDeviceType();
        
        this.peer = null;
        this.activeConnections = new Map(); // peerId -> DataConnection
        this.nearbyPeers = new Map();       // peerId -> { id, name, type, isSelf }
        
        // Transfer tracking
        this.transferHistory = [];
        this.receivingFileBuffers = new Map(); // transferId -> { metadata, chunks: [], receivedBytes }

        // DOM elements
        this.dom = {
            roomCodeDisplay: document.getElementById('wifiRoomCodeDisplay'),
            btnCopyRoomCode: document.getElementById('btnCopyRoomCode'),
            btnOpenQrModal: document.getElementById('btnOpenQrModal'),
            btnCloseQrModal: document.getElementById('btnCloseQrModal'),
            btnDoneQrModal: document.getElementById('btnDoneQrModal'),
            wifiQrModal: document.getElementById('wifiQrModal'),
            wifiModalQrHolder: document.getElementById('wifiModalQrHolder'),
            wifiModalRoomUrl: document.getElementById('wifiModalRoomUrl'),
            btnCopyModalUrl: document.getElementById('btnCopyModalUrl'),
            miniQrContainer: document.getElementById('wifiMiniQrContainer'),
            deviceCountBadge: document.getElementById('wifiDeviceCountBadge'),
            deviceCardList: document.getElementById('wifiDeviceCardList'),
            myDeviceNameInput: document.getElementById('wifiMyDeviceNameInput'),
            btnSaveDeviceName: document.getElementById('btnSaveDeviceName'),
            btnRefreshPeer: document.getElementById('btnRefreshPeer'),
            connectionStatus: document.getElementById('wifiConnectionStatus'),
            radarPulse: document.getElementById('wifiRadarPulse'),
            // Transfer UI
            dropZone: document.getElementById('wifiDropZone'),
            fileInput: document.getElementById('wifiFileInput'),
            progressBox: document.getElementById('wifiTransferProgressBox'),
            progressFileName: document.getElementById('wifiProgressFileName'),
            progressPercent: document.getElementById('wifiProgressPercent'),
            progressBarFill: document.getElementById('wifiProgressBarFill'),
            progressSpeed: document.getElementById('wifiProgressSpeed'),
            // Text & feed
            textInput: document.getElementById('wifiTextMsgInput'),
            btnSendText: document.getElementById('btnSendTextMsg'),
            btnPasteClip: document.getElementById('btnPasteFromClipboard'),
            btnClearText: document.getElementById('btnClearTextMsg'),
            feedList: document.getElementById('wifiFeedList'),
            feedEmptyState: document.getElementById('wifiFeedEmptyState'),
            btnClearFeed: document.getElementById('btnClearFeed')
        };
    }

    // Determine Room Code from URL query (?room=MK-XXXX) or generate/restore a persistent one
    resolveRoomCode() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomFromUrl = urlParams.get('room') || urlParams.get('transferRoom');
        if (roomFromUrl) {
            sessionStorage.setItem('mks_wifi_room', roomFromUrl.toUpperCase().trim());
            return roomFromUrl.toUpperCase().trim();
        }
        let stored = sessionStorage.getItem('mks_wifi_room');
        if (!stored) {
            const randomNum = Math.floor(1000 + Math.random() * 9000);
            stored = 'MK-' + randomNum;
            sessionStorage.setItem('mks_wifi_room', stored);
        }
        return stored;
    }

    detectDeviceType() {
        const ua = navigator.userAgent || navigator.vendor || window.opera;
        if (/android/i.test(ua)) return 'phone';
        if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
            return /iPad/.test(ua) ? 'tablet' : 'phone';
        }
        if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
        return 'laptop';
    }

    detectDeviceDefaultName() {
        const type = this.detectDeviceType();
        const rand = Math.floor(100 + Math.random() * 900);
        if (type === 'phone') {
            const isIOS = /iPhone|iPad/i.test(navigator.userAgent);
            return (isIOS ? 'iPhone' : 'Android') + ' (' + rand + ')';
        }
        if (type === 'tablet') return 'Tablet (' + rand + ')';
        return 'Laptop / PC (' + rand + ')';
    }

    getRoomPairUrl() {
        const url = new URL(window.location.href);
        url.searchParams.set('room', this.roomCode);
        url.searchParams.set('tool', 'wifi');
        return url.toString();
    }

    init() {
        this.setupUIBindings();
        this.renderMyDeviceUI();
        this.generateQRCodes();
        this.initPeerConnection();
        this.setupBroadcastChannel();
    }

    setupUIBindings() {
        if (this.dom.roomCodeDisplay) {
            this.dom.roomCodeDisplay.innerText = this.roomCode;
        }

        // Copy Room Code / Link
        const copyAction = async (txt, successMsg) => {
            try {
                await navigator.clipboard.writeText(txt);
                alert(successMsg || 'Copied to clipboard!');
            } catch (e) {
                const temp = document.createElement('input');
                temp.value = txt;
                document.body.appendChild(temp);
                temp.select();
                document.execCommand('copy');
                document.body.removeChild(temp);
                alert(successMsg || 'Copied to clipboard!');
            }
        };

        this.dom.btnCopyRoomCode?.addEventListener('click', () => {
            copyAction(this.getRoomPairUrl(), `Room link for ${this.roomCode} copied to clipboard! Share it with your phone or students.`);
        });

        this.dom.btnCopyModalUrl?.addEventListener('click', () => {
            copyAction(this.getRoomPairUrl(), 'Room pairing URL copied!');
        });

        // QR Modal
        this.dom.btnOpenQrModal?.addEventListener('click', () => this.openQrModal());
        this.dom.btnCloseQrModal?.addEventListener('click', () => this.closeQrModal());
        this.dom.btnDoneQrModal?.addEventListener('click', () => this.closeQrModal());
        this.dom.wifiQrModal?.addEventListener('click', (e) => {
            if (e.target === this.dom.wifiQrModal) this.closeQrModal();
        });

        // Save Device Name
        this.dom.btnSaveDeviceName?.addEventListener('click', () => {
            const val = this.dom.myDeviceNameInput?.value.trim();
            if (val) {
                this.myDeviceName = val;
                localStorage.setItem('mks_wifi_dev_name', val);
                this.broadcastPresence();
                this.renderDeviceList();
                this.showToast('Device name saved: ' + val);
            }
        });

        // Reconnect Peer
        this.dom.btnRefreshPeer?.addEventListener('click', () => {
            this.initPeerConnection();
            this.showToast('Re-connecting Wi-Fi P2P session...');
        });

        // File Drop & Select
        this.dom.dropZone?.addEventListener('click', (e) => {
            if (e.target.closest('#wifiTransferProgressBox')) return;
            this.dom.fileInput?.click();
        });

        this.dom.fileInput?.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                this.handleFilesToSend(Array.from(files));
                this.dom.fileInput.value = '';
            }
        });

        // Drag & Drop
        ['dragenter', 'dragover'].forEach(evt => {
            this.dom.dropZone?.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.dom.dropZone.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach(evt => {
            this.dom.dropZone?.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.dom.dropZone.classList.remove('dragover');
            });
        });

        this.dom.dropZone?.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files.length > 0) {
                this.handleFilesToSend(Array.from(dt.files));
            }
        });

        // Text / Clipboard message send
        this.dom.btnSendText?.addEventListener('click', () => this.sendTextMessage());
        this.dom.textInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.sendTextMessage();
            }
        });

        this.dom.btnPasteClip?.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text && this.dom.textInput) {
                    this.dom.textInput.value = text;
                    this.dom.textInput.focus();
                }
            } catch (err) {
                alert('Please allow clipboard permissions or paste directly with Ctrl+V / Cmd+V');
            }
        });

        this.dom.btnClearText?.addEventListener('click', () => {
            if (this.dom.textInput) this.dom.textInput.value = '';
        });

        this.dom.btnClearFeed?.addEventListener('click', () => {
            this.transferHistory = [];
            this.renderFeed();
        });
    }

    renderMyDeviceUI() {
        if (this.dom.myDeviceNameInput) {
            this.dom.myDeviceNameInput.value = this.myDeviceName;
        }
        if (this.dom.wifiModalRoomUrl) {
            this.dom.wifiModalRoomUrl.innerText = this.getRoomPairUrl();
        }
    }

    generateQRCodes() {
        const pairUrl = this.getRoomPairUrl();

        // Generate in modal
        if (this.dom.wifiModalQrHolder && window.QRCode) {
            this.dom.wifiModalQrHolder.innerHTML = '';
            new window.QRCode(this.dom.wifiModalQrHolder, {
                text: pairUrl,
                width: 190,
                height: 190,
                colorDark: '#0f172a',
                colorLight: '#ffffff',
                correctLevel: window.QRCode.CorrectLevel.M
            });
        }

        // Generate mini preview
        if (this.dom.miniQrContainer && window.QRCode) {
            this.dom.miniQrContainer.innerHTML = '';
            new window.QRCode(this.dom.miniQrContainer, {
                text: pairUrl,
                width: 140,
                height: 140,
                colorDark: '#0f172a',
                colorLight: '#ffffff',
                correctLevel: window.QRCode.CorrectLevel.M
            });
        }
    }

    openQrModal() {
        if (this.dom.wifiQrModal) {
            this.dom.wifiQrModal.style.display = 'flex';
        }
    }

    closeQrModal() {
        if (this.dom.wifiQrModal) {
            this.dom.wifiQrModal.style.display = 'none';
        }
    }

    // Local BroadcastChannel allows instant tab-to-tab communication on the same browser / device
    setupBroadcastChannel() {
        try {
            if ('BroadcastChannel' in window) {
                this.localChannel = new BroadcastChannel('mks_wifi_room_' + this.roomCode);
                this.localChannel.onmessage = (event) => {
                    const data = event.data;
                    if (!data) return;
                    if (data.type === 'presence' && data.senderId !== this.myDeviceId) {
                        this.registerPeerInfo(data.senderPeerId, {
                            id: data.senderPeerId,
                            name: data.senderName,
                            type: data.deviceType
                        });
                        // Respond with our presence
                        this.localChannel.postMessage({
                            type: 'presence_ack',
                            senderId: this.myDeviceId,
                            senderPeerId: this.peer?.id,
                            senderName: this.myDeviceName,
                            deviceType: this.deviceType
                        });
                    } else if (data.type === 'presence_ack' && data.senderId !== this.myDeviceId) {
                        this.registerPeerInfo(data.senderPeerId, {
                            id: data.senderPeerId,
                            name: data.senderName,
                            type: data.deviceType
                        });
                    }
                };
            }
        } catch (e) {
            console.warn('BroadcastChannel not supported', e);
        }
    }

    // =========================================================================
    // PEERJS WEBRTC P2P DIRECT WI-FI CONNECTION
    // =========================================================================
    initPeerConnection() {
        if (!window.Peer) {
            console.error('PeerJS library not loaded');
            return;
        }

        if (this.peer) {
            try { this.peer.destroy(); } catch (e) {}
        }

        // Deterministic room prefix for easy discovery
        const sanitizedRoom = this.roomCode.toLowerCase().replace(/[^a-z0-9]/g, '');
        const peerRandom = Math.random().toString(36).substring(2, 7);
        const myPeerId = `mkscore-${sanitizedRoom}-${peerRandom}`;

        this.peer = new window.Peer(myPeerId, {
            debug: 1,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' }
                ]
            }
        });

        this.peer.on('open', (id) => {
            console.log('PeerJS Connected with ID:', id);
            if (this.dom.connectionStatus) {
                this.dom.connectionStatus.innerText = 'Connected to Room (' + this.roomCode + ')';
            }
            if (this.dom.radarPulse) {
                this.dom.radarPulse.style.background = '#10b981';
            }

            // Register self
            this.nearbyPeers.set(id, {
                id: id,
                name: this.myDeviceName,
                type: this.deviceType,
                isSelf: true
            });
            this.renderDeviceList();

            // Broadcast presence to room members
            this.broadcastPresence();

            // Auto-discover room host or other devices
            this.scanAndConnectRoomPeers();
        });

        this.peer.on('connection', (conn) => {
            this.handleIncomingConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.warn('PeerJS connection status:', err);
            if (this.dom.connectionStatus) {
                this.dom.connectionStatus.innerText = 'Room Active: ' + this.roomCode;
            }
        });

        this.peer.on('disconnected', () => {
            try { this.peer.reconnect(); } catch (e) {}
        });
    }

    broadcastPresence() {
        if (!this.peer || !this.peer.id) return;

        // Local BroadcastChannel notify
        if (this.localChannel) {
            this.localChannel.postMessage({
                type: 'presence',
                senderId: this.myDeviceId,
                senderPeerId: this.peer.id,
                senderName: this.myDeviceName,
                deviceType: this.deviceType
            });
        }

        // Notify all established WebRTC connections
        this.activeConnections.forEach(conn => {
            if (conn.open) {
                conn.send({
                    type: 'peer_handshake',
                    peerId: this.peer.id,
                    deviceName: this.myDeviceName,
                    deviceType: this.deviceType
                });
            }
        });
    }

    scanAndConnectRoomPeers() {
        // Room broadcast mechanism via localStorage heartbeat for devices on the same domain/network
        const roomHeartbeatKey = 'mks_room_peers_' + this.roomCode;
        try {
            const existingRaw = localStorage.getItem(roomHeartbeatKey);
            let peers = existingRaw ? JSON.parse(existingRaw) : {};
            const now = Date.now();

            // Prune dead peers (>45s inactive)
            Object.keys(peers).forEach(pid => {
                if (now - peers[pid].lastSeen > 45000) {
                    delete peers[pid];
                }
            });

            // Connect to other active peers in room
            Object.keys(peers).forEach(pid => {
                if (pid !== this.peer.id) {
                    this.connectToPeer(pid, peers[pid].name, peers[pid].type);
                }
            });

            // Add self
            peers[this.peer.id] = {
                name: this.myDeviceName,
                type: this.deviceType,
                lastSeen: now
            };
            localStorage.setItem(roomHeartbeatKey, JSON.stringify(peers));

            // Heartbeat interval
            if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = setInterval(() => {
                try {
                    const raw = localStorage.getItem(roomHeartbeatKey);
                    let pMap = raw ? JSON.parse(raw) : {};
                    const curTime = Date.now();
                    Object.keys(pMap).forEach(pid => {
                        if (curTime - pMap[pid].lastSeen > 45000) delete pMap[pid];
                        else if (pid !== this.peer.id && !this.activeConnections.has(pid)) {
                            this.connectToPeer(pid, pMap[pid].name, pMap[pid].type);
                        }
                    });
                    pMap[this.peer.id] = {
                        name: this.myDeviceName,
                        type: this.deviceType,
                        lastSeen: curTime
                    };
                    localStorage.setItem(roomHeartbeatKey, JSON.stringify(pMap));
                } catch (e) {}
            }, 5000);
        } catch (e) {}
    }

    connectToPeer(targetPeerId, targetName, targetType) {
        if (!this.peer || this.activeConnections.has(targetPeerId) || targetPeerId === this.peer.id) {
            return;
        }

        console.log('Connecting to peer:', targetPeerId);
        const conn = this.peer.connect(targetPeerId, {
            reliable: true
        });

        this.setupConnectionEvents(conn, targetName, targetType);
    }

    handleIncomingConnection(conn) {
        console.log('Incoming connection from:', conn.peer);
        this.setupConnectionEvents(conn);
    }

    setupConnectionEvents(conn, knownName, knownType) {
        conn.on('open', () => {
            console.log('Connection opened with:', conn.peer);
            this.activeConnections.set(conn.peer, conn);

            // Send handshake
            conn.send({
                type: 'peer_handshake',
                peerId: this.peer.id,
                deviceName: this.myDeviceName,
                deviceType: this.deviceType
            });

            this.registerPeerInfo(conn.peer, {
                id: conn.peer,
                name: knownName || 'Connected Device',
                type: knownType || 'phone'
            });

            this.playNotificationChime('connect');
            this.showToast(`Device paired: ${knownName || 'New Device'}`);
        });

        conn.on('data', (data) => {
            this.handleReceivedData(conn, data);
        });

        conn.on('close', () => {
            console.log('Connection closed with:', conn.peer);
            this.activeConnections.delete(conn.peer);
            this.nearbyPeers.delete(conn.peer);
            this.renderDeviceList();
        });

        conn.on('error', (err) => {
            console.warn('Connection error with peer:', conn.peer, err);
            this.activeConnections.delete(conn.peer);
        });
    }

    registerPeerInfo(peerId, info) {
        if (!peerId) return;
        this.nearbyPeers.set(peerId, {
            id: peerId,
            name: info.name || 'Wireless Device',
            type: info.type || 'phone',
            isSelf: peerId === this.peer?.id
        });
        this.renderDeviceList();
    }

    renderDeviceList() {
        if (!this.dom.deviceCardList) return;
        this.dom.deviceCardList.innerHTML = '';

        const peersArray = Array.from(this.nearbyPeers.values());
        
        if (this.dom.deviceCountBadge) {
            const count = peersArray.length;
            this.dom.deviceCountBadge.innerText = `${count} ${count === 1 ? 'Device' : 'Devices'}`;
        }

        peersArray.forEach(peer => {
            const card = document.createElement('div');
            card.className = `device-card ${peer.isSelf ? 'self' : ''}`;

            const iconSvg = peer.type === 'phone'
                ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>`
                : peer.type === 'tablet'
                ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>`
                : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;

            card.innerHTML = `
                <div class="device-card-info">
                    <div class="device-avatar ${peer.type}">
                        ${iconSvg}
                    </div>
                    <div>
                        <div style="font-weight: 800; font-size: 13.5px; color: var(--text-dark, #0f172a);">
                            ${this.escapeHtml(peer.name)} ${peer.isSelf ? '<span style="font-size: 11px; opacity: 0.7; font-weight: 700;">(You)</span>' : ''}
                        </div>
                        <div style="font-size: 11.5px; color: var(--text-muted, #64748b); display: flex; align-items: center; gap: 6px;">
                            <span style="width: 6px; height: 6px; border-radius: 50%; background: #10b981; display: inline-block;"></span>
                            <span>${peer.isSelf ? 'This Device' : 'Wi-Fi Ready'}</span>
                        </div>
                    </div>
                </div>
                ${!peer.isSelf ? `
                    <button class="btn-primary btn-direct-send" style="padding: 5px 12px; font-size: 11.5px; border-radius: 8px;">
                        Send File
                    </button>
                ` : ''}
            `;

            if (!peer.isSelf) {
                card.querySelector('.btn-direct-send')?.addEventListener('click', () => {
                    this.dom.fileInput?.click();
                });
            }

            this.dom.deviceCardList.appendChild(card);
        });
    }

    // =========================================================================
    // DATA TRANSFER PROTOCOL (TEXT & BINARY CHUNKS OVER WEBRTC)
    // =========================================================================
    handleReceivedData(conn, data) {
        if (!data) return;

        // 1. Peer Handshake
        if (data.type === 'peer_handshake') {
            this.registerPeerInfo(data.peerId || conn.peer, {
                name: data.deviceName,
                type: data.deviceType
            });
        }
        // 2. Text or Clipboard message
        else if (data.type === 'text_message') {
            this.playNotificationChime('message');
            this.addFeedItem({
                type: 'text',
                senderName: data.senderName || 'Peer Device',
                text: data.content,
                timestamp: Date.now()
            });
            this.showToast(`Text received from ${data.senderName || 'Device'}`);
        }
        // 3. File Start Header
        else if (data.type === 'file_start') {
            this.receivingFileBuffers.set(data.transferId, {
                metadata: data.metadata,
                senderName: data.senderName || 'Peer Device',
                totalBytes: data.metadata.size,
                receivedBytes: 0,
                chunks: []
            });
            this.updateProgressBar(0, data.metadata.name, 'Receiving...');
        }
        // 4. File Binary Chunk
        else if (data.type === 'file_chunk') {
            const transfer = this.receivingFileBuffers.get(data.transferId);
            if (!transfer) return;

            transfer.chunks.push(data.chunk);
            transfer.receivedBytes += data.chunk.byteLength || data.chunk.size || 0;

            const percent = Math.round((transfer.receivedBytes / transfer.totalBytes) * 100);
            this.updateProgressBar(percent, transfer.metadata.name, `Receiving ${percent}%`);

            if (data.isLastChunk) {
                this.finishReceivingFile(data.transferId);
            }
        }
    }

    finishReceivingFile(transferId) {
        const transfer = this.receivingFileBuffers.get(transferId);
        if (!transfer) return;

        const blob = new Blob(transfer.chunks, { type: transfer.metadata.type || 'application/octet-stream' });
        const fileUrl = URL.createObjectURL(blob);

        this.hideProgressBar();
        this.playNotificationChime('file');

        this.addFeedItem({
            type: 'file',
            senderName: transfer.senderName,
            fileName: transfer.metadata.name,
            fileSize: this.formatBytes(transfer.totalBytes),
            fileType: transfer.metadata.type,
            fileUrl: fileUrl,
            blob: blob,
            timestamp: Date.now()
        });

        this.showToast(`Received "${transfer.metadata.name}"!`);
        this.receivingFileBuffers.delete(transferId);
    }

    // Send Text / Clipboard
    sendTextMessage() {
        const text = this.dom.textInput?.value.trim();
        if (!text) {
            alert('Please enter or paste some text to send.');
            return;
        }

        const payload = {
            type: 'text_message',
            senderName: this.myDeviceName,
            senderId: this.myDeviceId,
            content: text,
            timestamp: Date.now()
        };

        let sentCount = 0;
        this.activeConnections.forEach(conn => {
            if (conn.open) {
                conn.send(payload);
                sentCount++;
            }
        });

        // Add to self feed
        this.addFeedItem({
            type: 'text',
            senderName: 'You (' + this.myDeviceName + ')',
            text: text,
            timestamp: Date.now(),
            isOutgoing: true
        });

        if (this.dom.textInput) this.dom.textInput.value = '';

        if (sentCount === 0) {
            this.showToast('Note saved locally. Connect your phone via QR to sync wirelessly!');
        } else {
            this.showToast(`Sent to ${sentCount} connected ${sentCount === 1 ? 'device' : 'devices'}!`);
            this.playNotificationChime('send');
        }
    }

    // Send Files
    async handleFilesToSend(files) {
        if (!files || files.length === 0) return;

        const openConnections = Array.from(this.activeConnections.values()).filter(c => c.open);
        if (openConnections.length === 0) {
            alert('No device connected yet! Please scan the QR code with your phone or open another device in room: ' + this.roomCode);
            this.openQrModal();
            return;
        }

        for (const file of files) {
            await this.streamFileOverWebRTC(file, openConnections);
        }
    }

    async streamFileOverWebRTC(file, connections) {
        const CHUNK_SIZE = 64 * 1024; // 64 KB per chunk for optimal WebRTC throughput
        const transferId = 'tx_' + Math.random().toString(36).substring(2, 9);
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        this.updateProgressBar(0, file.name, 'Preparing transfer...');

        // 1. Send file_start header
        const startPayload = {
            type: 'file_start',
            transferId: transferId,
            senderName: this.myDeviceName,
            metadata: {
                name: file.name,
                size: file.size,
                type: file.type || 'application/octet-stream'
            }
        };

        connections.forEach(conn => conn.send(startPayload));

        // 2. Stream binary chunks
        let offset = 0;
        let chunkIndex = 0;

        while (offset < file.size) {
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            const arrayBuffer = await slice.arrayBuffer();

            const isLast = (offset + CHUNK_SIZE >= file.size);
            const chunkPayload = {
                type: 'file_chunk',
                transferId: transferId,
                chunkIndex: chunkIndex,
                isLastChunk: isLast,
                chunk: arrayBuffer
            };

            connections.forEach(conn => conn.send(chunkPayload));

            offset += CHUNK_SIZE;
            chunkIndex++;

            const percent = Math.min(100, Math.round((offset / file.size) * 100));
            this.updateProgressBar(percent, file.name, `Sending ${percent}% (${this.formatBytes(offset)} / ${this.formatBytes(file.size)})`);

            // Small yield to keep event loop and buffer smooth
            if (chunkIndex % 8 === 0) {
                await new Promise(r => setTimeout(r, 10));
            }
        }

        this.hideProgressBar();
        this.playNotificationChime('send');

        // Add to outgoing feed
        const fileUrl = URL.createObjectURL(file);
        this.addFeedItem({
            type: 'file',
            senderName: 'You (' + this.myDeviceName + ')',
            fileName: file.name,
            fileSize: this.formatBytes(file.size),
            fileType: file.type,
            fileUrl: fileUrl,
            blob: file,
            timestamp: Date.now(),
            isOutgoing: true
        });

        this.showToast(`Transferred "${file.name}" successfully!`);
    }

    // =========================================================================
    // PROGRESS BAR & TOASTS & FEED
    // =========================================================================
    updateProgressBar(percent, fileName, statusText) {
        if (!this.dom.progressBox) return;
        this.dom.progressBox.style.display = 'block';
        if (this.dom.progressFileName) this.dom.progressFileName.innerText = fileName;
        if (this.dom.progressPercent) this.dom.progressPercent.innerText = percent + '%';
        if (this.dom.progressBarFill) this.dom.progressBarFill.style.width = percent + '%';
        if (this.dom.progressSpeed) this.dom.progressSpeed.innerText = statusText || 'Transferring...';
    }

    hideProgressBar() {
        if (this.dom.progressBox) {
            setTimeout(() => {
                this.dom.progressBox.style.display = 'none';
                if (this.dom.progressBarFill) this.dom.progressBarFill.style.width = '0%';
            }, 600);
        }
    }

    addFeedItem(item) {
        this.transferHistory.unshift(item);
        this.renderFeed();
    }

    renderFeed() {
        if (!this.dom.feedList) return;

        if (this.transferHistory.length === 0) {
            this.dom.feedList.innerHTML = '';
            if (this.dom.feedEmptyState) {
                this.dom.feedList.appendChild(this.dom.feedEmptyState);
            }
            return;
        }

        this.dom.feedList.innerHTML = '';

        this.transferHistory.forEach((item, index) => {
            const feedEl = document.createElement('div');
            feedEl.className = 'wifi-feed-item';

            const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            if (item.type === 'text') {
                feedEl.innerHTML = `
                    <div class="wifi-feed-left">
                        <div class="wifi-feed-icon-box" style="background: rgba(14, 165, 233, 0.12); color: #0284c7;">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        </div>
                        <div style="min-width: 0;">
                            <div style="font-size: 11.5px; font-weight: 700; color: var(--text-muted, #64748b); margin-bottom: 2px;">
                                ${this.escapeHtml(item.senderName)} • ${timeStr}
                            </div>
                            <div style="font-size: 14px; font-weight: 600; color: var(--text-dark, #0f172a); word-break: break-word;">
                                ${this.formatLinkifiedText(item.text)}
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; flex-shrink: 0;">
                        <button class="btn-secondary btn-copy-feed" style="padding: 6px 12px; font-size: 12px; border-radius: 8px;">Copy</button>
                    </div>
                `;

                feedEl.querySelector('.btn-copy-feed')?.addEventListener('click', async () => {
                    await navigator.clipboard.writeText(item.text);
                    this.showToast('Text copied to clipboard!');
                });
            } else if (item.type === 'file') {
                const isImg = item.fileType && item.fileType.startsWith('image/');

                feedEl.innerHTML = `
                    <div class="wifi-feed-left">
                        ${isImg ? `
                            <img src="${item.fileUrl}" class="wifi-feed-thumb" alt="Preview">
                        ` : `
                            <div class="wifi-feed-icon-box">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                            </div>
                        `}
                        <div style="min-width: 0;">
                            <div style="font-size: 11.5px; font-weight: 700; color: var(--text-muted, #64748b); margin-bottom: 2px;">
                                ${this.escapeHtml(item.senderName)} • ${timeStr} • ${item.fileSize}
                            </div>
                            <div style="font-size: 14px; font-weight: 700; color: var(--text-dark, #0f172a); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${this.escapeHtml(item.fileName)}
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; flex-shrink: 0;">
                        <a href="${item.fileUrl}" download="${this.escapeHtml(item.fileName)}" class="btn-primary" style="text-decoration: none; padding: 6px 14px; font-size: 12.5px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            Save
                        </a>
                    </div>
                `;
            }

            this.dom.feedList.appendChild(feedEl);
        });
    }

    // Audio synthesizer chimes using Web Audio API
    playNotificationChime(type) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            if (type === 'connect') {
                // Rising pleasant two-tone
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523.25, now); // C5
                osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
                gain.gain.setValueAtTime(0.18, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
            } else if (type === 'file') {
                // Triple chime for file arrival
                osc.type = 'sine';
                osc.frequency.setValueAtTime(587.33, now); // D5
                osc.frequency.setValueAtTime(783.99, now + 0.1); // G5
                osc.frequency.setValueAtTime(1046.50, now + 0.2); // C6
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
                osc.start(now);
                osc.stop(now + 0.45);
            } else {
                // Soft notification pop
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(880, now);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
                osc.start(now);
                osc.stop(now + 0.18);
            }

            osc.connect(gain);
            gain.connect(ctx.destination);
        } catch (e) {}
    }

    showToast(message) {
        let toast = document.getElementById('wifiTransferToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'wifiTransferToast';
            toast.style.position = 'fixed';
            toast.style.bottom = '24px';
            toast.style.right = '24px';
            toast.style.zIndex = '999999';
            toast.style.background = '#0f172a';
            toast.style.color = '#ffffff';
            toast.style.padding = '12px 20px';
            toast.style.borderRadius = '12px';
            toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.3)';
            toast.style.fontSize = '13.5px';
            toast.style.fontWeight = '700';
            toast.style.transition = 'all 0.25s ease';
            toast.style.display = 'none';
            document.body.appendChild(toast);
        }
        toast.innerText = message;
        toast.style.display = 'block';
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';

        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(8px)';
            setTimeout(() => { toast.style.display = 'none'; }, 250);
        }, 3000);
    }

    formatBytes(bytes) {
        if (!+bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    formatLinkifiedText(text) {
        const escaped = this.escapeHtml(text);
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return escaped.replace(urlRegex, (url) => {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline; font-weight: 700;">${url}</a>`;
        });
    }
}

// Export single instance initializer
export function initWifiDataTransfer() {
    const manager = new WifiDataTransferManager();
    manager.init();
    window.wifiTransferManager = manager;
    return manager;
}

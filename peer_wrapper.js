/**
 * PeerJS Wrapper for Remote Communication
 * Handles WebRTC connections between Coach and Athlete
 */
const RemoteDB = {
    peer: null,
    conn: null,
    myId: null,
    role: null,

    // Callbacks
    onConnectionOpen: null,
    onMessage: null,
    onStatusChange: null,

    // Initialize Peer
    init(persistentSuffix, onReady) {
        // Generate ID using persistent suffix if provided, otherwise random
        const idSuffix = persistentSuffix || Math.random().toString(36).substr(2, 6).toUpperCase();
        const fullId = 'aic-' + idSuffix;

        this.peer = new Peer(fullId);

        this.peer.on('open', (id) => {
            console.log('My peer ID is: ' + id);
            this.myId = id;
            if (onReady) onReady(id.replace('aic-', '')); // Show user friendly code
        });

        this.peer.on('connection', (conn) => {
            this.handleConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
            if (this.onStatusChange) this.onStatusChange('error', err.message);
        });
    },

    // Connect to another peer (Coach connects to Athlete)
    connect(remoteCode) {
        const fullId = 'aic-' + remoteCode.toUpperCase();
        console.log('Connecting to:', fullId);

        if (this.conn) {
            this.conn.close();
        }

        const conn = this.peer.connect(fullId);
        this.handleConnection(conn);
    },

    // Handle incoming/outgoing connection
    handleConnection(conn) {
        this.conn = conn;

        conn.on('open', () => {
            console.log('Connected to:', conn.peer);
            if (this.onStatusChange) this.onStatusChange('connected', conn.peer);

            // Send test message
            this.send({ type: 'GREETING', from: this.role });
        });

        conn.on('data', (data) => {
            console.log('Received:', data);
            if (this.onMessage) this.onMessage(data);
        });

        conn.on('close', () => {
            console.log('Connection closed');
            this.conn = null;
            if (this.onStatusChange) this.onStatusChange('disconnected');
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
            if (this.onStatusChange) this.onStatusChange('error', err.message);
        });
    },

    // Send data
    send(data) {
        if (this.conn && this.conn.open) {
            this.conn.send(data);
            return true;
        }
        return false;
    }
};

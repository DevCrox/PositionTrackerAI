/**
 * Simple LocalStorage Database Wrapper
 */
const DB = {
    // Keys
    KEYS: {
        USERS: 'aic_users',
        CURRENT_USER: 'aic_current_user',
        REQUESTS: 'aic_connection_requests',
        NOTIFICATIONS: 'aic_notifications'
    },

    // --- Core Helpers ---
    _get(key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    },

    _save(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    },

    _generateId() {
        return Math.random().toString(36).substr(2, 9);
    },

    _generateCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    },

    // --- User Management ---
    getUsers() {
        return this._get(this.KEYS.USERS);
    },

    findUserByEmail(email) {
        const users = this.getUsers();
        return users.find(u => u.email === email);
    },

    findUserByCode(code) {
        const users = this.getUsers();
        // Debugging logs
        console.log('Searching for code:', code, 'Type:', typeof code);
        console.log('Available users with codes:', users.filter(u => u.code).map(u => ({ name: u.name, code: u.code, type: typeof u.code })));

        return users.find(u => String(u.code) === String(code).trim());
    },

    findUserById(id) {
        const users = this.getUsers();
        return users.find(u => u.id === id);
    },

    createUser(userData) {
        const users = this.getUsers();
        if (this.findUserByEmail(userData.email)) {
            throw new Error('Email already exists');
        }

        const newUser = {
            id: this._generateId(),
            ...userData,
            createdAt: Date.now()
        };

        if (userData.role === 'athlete') {
            newUser.code = String(this._generateCode()); // Ensure string
            newUser.coachId = null;
        } else {
            newUser.athletes = [];
        }

        users.push(newUser);
        this._save(this.KEYS.USERS, users);
        return newUser;
    },

    login(email, password) {
        const user = this.findUserByEmail(email);
        if (user && user.password === password) {
            localStorage.setItem(this.KEYS.CURRENT_USER, JSON.stringify(user));
            return user;
        }
        throw new Error('Invalid credentials');
    },

    logout() {
        localStorage.removeItem(this.KEYS.CURRENT_USER);
    },

    getCurrentUser() {
        const data = localStorage.getItem(this.KEYS.CURRENT_USER);
        return data ? JSON.parse(data) : null;
    },

    // --- Connection Requests ---
    createConnectionRequest(coachId, athleteCode) {
        const athlete = this.findUserByCode(athleteCode);
        if (!athlete) throw new Error('Athlete not found');
        if (athlete.role !== 'athlete') throw new Error('Invalid code');
        if (athlete.coachId) throw new Error('Athlete already has a coach');

        const coach = this.findUserById(coachId);

        const requests = this._get(this.KEYS.REQUESTS);

        // Check if pending exists
        const exists = requests.find(r =>
            r.fromCoachId === coachId &&
            r.toAthleteId === athlete.id &&
            r.status === 'pending'
        );
        if (exists) throw new Error('Request already pending');

        const request = {
            id: this._generateId(),
            fromCoachId: coachId,
            coachName: coach.name,
            toAthleteId: athlete.id,
            status: 'pending',
            timestamp: Date.now()
        };

        requests.push(request);
        this._save(this.KEYS.REQUESTS, requests);
        return request;
    },

    getPendingRequests(athleteId) {
        const requests = this._get(this.KEYS.REQUESTS);
        return requests.filter(r => r.toAthleteId === athleteId && r.status === 'pending');
    },

    handleRequest(requestId, action) { // action: 'accept' | 'reject'
        const requests = this._get(this.KEYS.REQUESTS);
        const reqIndex = requests.findIndex(r => r.id === requestId);
        if (reqIndex === -1) throw new Error('Request not found');

        const request = requests[reqIndex];
        request.status = action === 'accept' ? 'accepted' : 'rejected';

        if (action === 'accept') {
            // Link users
            const users = this.getUsers();

            // Update Athlete
            const athlete = users.find(u => u.id === request.toAthleteId);
            athlete.coachId = request.fromCoachId;

            // Update Coach
            const coach = users.find(u => u.id === request.fromCoachId);
            if (!coach.athletes) coach.athletes = [];
            coach.athletes.push(athlete.id);

            this._save(this.KEYS.USERS, users);

            // Update current session if it's the athlete
            const currentUser = this.getCurrentUser();
            if (currentUser && currentUser.id === athlete.id) {
                localStorage.setItem(this.KEYS.CURRENT_USER, JSON.stringify(athlete));
            }
        }

        this._save(this.KEYS.REQUESTS, requests);
    },

    // --- Notifications ---
    sendNotification(toUserId, type, message, payload = {}) {
        const notifications = this._get(this.KEYS.NOTIFICATIONS);
        const currentUser = this.getCurrentUser();

        const notification = {
            id: this._generateId(),
            toUserId,
            fromUserId: currentUser ? currentUser.id : null,
            fromName: currentUser ? currentUser.name : 'System',
            type,
            message,
            payload,
            timestamp: Date.now(),
            read: false
        };

        notifications.push(notification);
        this._save(this.KEYS.NOTIFICATIONS, notifications);
    },

    getNotifications(userId) {
        const notifications = this._get(this.KEYS.NOTIFICATIONS);
        return notifications
            .filter(n => n.toUserId === userId)
            .sort((a, b) => b.timestamp - a.timestamp);
    },

    markNotificationRead(notifId) {
        const notifications = this._get(this.KEYS.NOTIFICATIONS);
        const notif = notifications.find(n => n.id === notifId);
        if (notif) {
            notif.read = true;
            this._save(this.KEYS.NOTIFICATIONS, notifications);
        }
    },

    // Get athletes for a coach
    getCoachAthletes(coachId) {
        const users = this.getUsers();
        return users.filter(u => u.coachId === coachId);
    }
};

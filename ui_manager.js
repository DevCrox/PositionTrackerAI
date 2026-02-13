/**
 * UI Manager - PeerJS & Premium UI Edition
 */

const UI = {
    role: null,
    connectedPeer: null,

    // DOM Elements - Lazy getters to avoid null on init
    get els() {
        return {
            authView: document.getElementById('auth-view'),
            coachDash: document.getElementById('coach-dashboard'),
            athleteDash: document.getElementById('athlete-dashboard'),
            statusBadge: document.getElementById('status-badge'),
            notifList: document.getElementById('notification-list')
        };
    },

    init() {
        // Check for existing session
        const user = DB.getCurrentUser();

        // Validate user object before auto-login
        if (user && user.role && (user.role === 'athlete' || user.role === 'coach')) {
            console.log('Restoring session for:', user.name);
            this.login(user);
        } else {
            // Invalid or no session -> Clear and show Auth
            if (user) DB.logout();

            document.getElementById('auth-container').style.display = 'block';
            document.getElementById('app-content').style.display = 'none';
        }
    },

    // --- Premium Auth Flow ---
    login(user) {
        this.role = user.role;
        // Hide Auth
        document.getElementById('auth-container').style.display = 'none';

        // Show Loading
        this.showLoading();
        document.getElementById('app-content').style.display = 'block';

        // Init Peer with User's persistent Code (if athlete) or ID
        // For athletes, we use their 6-digit code as the ID suffix
        const peerSuffix = user.role === 'athlete' ? user.code : user.id;

        RemoteDB.init(peerSuffix, (id) => {
            this.hideLoading();
            this.updateStatus('online');
            if (this.role === 'athlete') {
                this.renderAthleteDash(user.code);
            } else {
                this.renderCoachDash();
            }
        });

        // Listen for remote events
        RemoteDB.onStatusChange = (status) => this.updateStatus(status);
        RemoteDB.onMessage = (data) => this.handleMessage(data);
    },

    guestLogin() {
        const guestUser = {
            id: 'guest-' + Math.random().toString(36).substr(2, 4),
            name: 'Guest User',
            role: 'athlete',
            code: 'GUEST'
        };
        this.login(guestUser);
    },

    showLoading() {
        let loader = document.getElementById('loading-state');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'loading-state';
            loader.innerHTML = '<div style="text-align:center; padding:50px;"><div style="font-size:2rem; margin-bottom:10px;">🔄</div><div>Connecting...</div></div>';
            loader.className = 'glass-panel';
            loader.style.margin = '2rem auto';
            loader.style.maxWidth = '400px';
            document.getElementById('app-content').prepend(loader);
        }
        loader.style.display = 'block';
    },

    hideLoading() {
        const loader = document.getElementById('loading-state');
        if (loader) loader.style.display = 'none';
    },

    updateStatus(status) {
        const badge = document.getElementById('status-badge');
        if (!badge) return;

        if (status === 'connected') {
            badge.className = 'status-badge connected';
            badge.innerHTML = '🟢 Connected';
        } else if (status === 'error' || status === 'disconnected') {
            badge.className = 'status-badge disconnected';
            badge.innerHTML = '🔴 Disconnected';
        } else {
            badge.className = 'status-badge';
            badge.innerHTML = '🟡 Online (Waiting)';
        }
    },

    // --- Coach Views ---
    renderCoachDash() {
        document.getElementById('coach-dashboard').style.display = 'block';
        document.getElementById('athlete-dashboard').style.display = 'none';

        const nav = document.getElementById('nav-role');
        nav.innerHTML = `COACH PORTAL <button onclick="UI.logout()" style="margin-left:15px; font-size:0.8rem; background:none; border:1px solid #555; color:#aaa; padding:2px 8px; border-radius:4px; cursor:pointer;">LOGOUT</button>`;
    },

    connectToAthlete() {
        const input = document.getElementById('athlete-code-input');
        const code = input.value.trim();
        if (!code) return alert('Enter athlete code');
        RemoteDB.connect(code);
    },

    // --- Athlete Views ---
    renderAthleteDash(fullId) {
        document.getElementById('coach-dashboard').style.display = 'none';
        document.getElementById('athlete-dashboard').style.display = 'block';

        const nav = document.getElementById('nav-role');
        nav.innerHTML = `ATHLETE ZONE <button onclick="UI.logout()" style="margin-left:15px; font-size:0.8rem; background:none; border:1px solid #555; color:#aaa; padding:2px 8px; border-radius:4px; cursor:pointer;">LOGOUT</button>`;

        // Extract 4-digit or 6-digit code from ID
        // Format: aic-XU82A
        const displayCode = fullId;
        document.getElementById('my-code-display').textContent = displayCode;
    },

    goToTraining() {
        document.getElementById('athlete-dashboard').style.display = 'none';
        document.getElementById('exercise-selection').style.display = 'block';
    },

    backToDashboard() {
        document.getElementById('exercise-selection').style.display = 'none';
        document.getElementById('exercise-container').style.display = 'none';

        if (this.role === 'coach') {
            document.getElementById('coach-dashboard').style.display = 'block';
        } else {
            document.getElementById('athlete-dashboard').style.display = 'block';
        }

        if (window.localStream) {
            window.localStream.getTracks().forEach(track => track.stop());
            window.localStream = null;
        }
    },

    logout() {
        DB.logout();
        window.location.reload();
    },

    // --- Messaging ---
    handleMessage(data) {
        console.log('MSG:', data);
        if (this.role === 'coach' && data.type === 'HELP') {
            this.showNotification(data.msg);
        }
    },

    showNotification(msg) {
        const container = document.getElementById('notification-list');
        const card = document.createElement('div');
        card.className = 'notif-card glass-panel';
        card.innerHTML = `
            <div>
                <div class="notif-text">🚨 ${msg}</div>
                <div class="notif-time">Just now</div>
            </div>
            <button class="btn-icon">👁️</button>
        `;
        container.prepend(card);
    },

    // Called by "Call Coach" button in app.js
    sendHelpRequest(exercise) {
        const sent = RemoteDB.send({
            type: 'HELP',
            msg: `Athlete needs help with ${exercise}`
        });

        if (sent) {
            alert('Signal sent to Coach!');
        } else {
            alert('Not connected to Coach yet!');
        }
    }
};

// Auth Form Handling
function handleSignup(e) {
    e.preventDefault();
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const role = document.getElementById('signup-role').value;

    try {
        const user = DB.createUser({ name, email, password, role });
        DB.login(email, password);
        UI.login(user); // Pass user object
    } catch (err) {
        alert(err.message);
    }
}

function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        const user = DB.login(email, password);
        UI.login(user); // Pass user object
    } catch (err) {
        alert(err.message);
    }
}

function toggleAuthMode() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const title = document.getElementById('auth-title');
    const toggleBtn = document.getElementById('auth-toggle-btn');

    if (loginForm.style.display !== 'none') {
        loginForm.style.display = 'none';
        signupForm.style.display = 'block';
        title.textContent = 'Join the Club';
        toggleBtn.textContent = 'Already a member? Login';
    } else {
        loginForm.style.display = 'block';
        signupForm.style.display = 'none';
        title.textContent = 'Welcome Back';
        toggleBtn.textContent = 'New here? Create Account';
    }
}

// Global for HTML access
window.UI = UI;

export class SpeakManager {
    constructor(app) {
        this.app = app;
        this.db = app.db;
        this.requestsRef = null;
    }

    init() {
        if (!this.app.state.room) return;
        this.requestsRef = `chats/${this.app.state.room}/speak_requests`;

        if (this.app.state.role === 'teacher') {
            this.listenForRequests();
        } else {
            this.listenForApprovals();
        }
    }

    // --- STUDENT SIDE ---
    async requestToSpeak() {
        if (!this.app.state.room || !this.app.state.name) return;

        const btn = document.getElementById('speak-request-btn');
        if (btn) {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin text-lg"></i>';
        }

        try {
            const { ref, push, set } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
            const newRequestRef = push(ref(this.db, this.requestsRef));
            await set(newRequestRef, {
                uid: this.app.state.name, // Using name as simplistic UID for now
                name: this.app.state.name,
                status: 'pending',
                timestamp: Date.now()
            });
            this.app.showToast("Request sent. Waiting for teacher approval.", "info");
            this.currentRequestId = newRequestRef.key;
        } catch (e) {
            console.error("Speak request failed", e);
            this.app.showToast("Failed to send request", "error");
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
                btn.innerHTML = '<i class="fa-solid fa-microphone text-lg"></i>';
            }
        }
    }

    async listenForApprovals() {
        console.log('Starting to listen for approvals for:', this.app.state.name); // Debug log
        const { ref, onValue } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
        onValue(ref(this.db, this.requestsRef), (snapshot) => {
            const data = snapshot.val();
            console.log('Approval data received:', data); // Debug log
            if (!data) return;

            Object.entries(data).forEach(([key, req]) => {
                console.log('Checking request:', req, 'for user:', this.app.state.name); // Debug log
                if (req.name === this.app.state.name) {
                    if (req.status === 'approved') {
                        console.log('Request approved for:', this.app.state.name); // Debug log
                        this.onApproved();
                        // Clean up approved request
                        this.removeRequest(key);
                    } else if (req.status === 'denied') {
                        console.log('Request denied for:', this.app.state.name); // Debug log
                        this.onDenied();
                        // Clean up denied request
                        this.removeRequest(key);
                    }
                }
            });
        });
    }

    async removeRequest(requestId) {
        try {
            const { ref, remove } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
            await remove(ref(this.db, `${this.requestsRef}/${requestId}`));
        } catch (e) {
            console.error("Failed to remove request:", e);
        }
    }

    onDenied() {
        this.app.showToast("Request denied by teacher", "warning");
        this.resetRequestButton();
    }

    onApproved() {
        console.log('onApproved called for:', this.app.state.name); // Debug log
        
        // Show multiple notifications to ensure student sees it
        this.app.showToast("🎤 Teacher approved! You can now speak.", "success");
        
        // Also show an alert as backup
        setTimeout(() => {
            alert("Teacher approved your request! Click the green microphone button to start speaking.");
        }, 500);
        
        const btn = document.getElementById('speak-request-btn');
        if (btn) {
            console.log('Updating button for approved request'); // Debug log
            
            // Change button appearance
            btn.classList.remove('bg-gradient-to-br', 'from-blue-500', 'to-indigo-600');
            btn.classList.add('bg-green-500', 'animate-pulse', 'shadow-lg', 'shadow-green-500/50');
            btn.innerHTML = '<i class="fa-solid fa-microphone-lines text-lg"></i>';
            btn.title = "Click to start speaking";
            
            // Enable microphone for student
            btn.onclick = async () => {
                console.log('Student clicked to start speaking'); // Debug log
                this.app.showToast("🎙️ Microphone activated! Speak now.", "success");
                
                try {
                    // Request microphone permissions first
                    const stream = await navigator.mediaDevices.getUserMedia({ 
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true
                        }
                    });
                    console.log('Microphone access granted'); // Debug log
                    
                    // Start the microphone using teacher's toggleMic logic
                    await this.app.startDeepgram();
                    
                    // Change button to show it's recording
                    btn.classList.remove('animate-pulse', 'bg-green-500');
                    btn.classList.add('bg-red-500');
                    btn.innerHTML = '<i class="fa-solid fa-microphone-slash text-lg"></i>';
                    btn.title = "Click to stop speaking";
                    
                    // When stopping mic, reset the button
                    btn.onclick = () => {
                        console.log('Student clicked to stop speaking'); // Debug log
                        this.app.stopDeepgram();
                        this.resetRequestButton();
                    };
                    
                } catch (error) {
                    console.error('Microphone access denied:', error);
                    this.app.showToast("Microphone access denied. Please allow microphone access.", "error");
                    this.resetRequestButton();
                }
            };
        } else {
            console.error('Speak request button not found'); // Debug log
        }
    }

    resetRequestButton() {
        const btn = document.getElementById('speak-request-btn');
        if (btn) {
            btn.classList.remove('bg-green-500', 'animate-pulse');
            btn.classList.add('bg-gradient-to-br', 'from-blue-500', 'to-indigo-600');
            btn.innerHTML = '<i class="fa-solid fa-microphone text-lg"></i>';
            btn.onclick = () => this.requestToSpeak();
        }
    }

    // --- TEACHER SIDE ---
    async listenForRequests() {
        const { ref, onChildAdded, onValue } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");

        onValue(ref(this.db, this.requestsRef), (snapshot) => {
            const data = snapshot.val() || {};
            const count = Object.values(data).filter(r => r.status === 'pending').length;
            const badge = document.getElementById('speak-request-count');
            if (badge) badge.innerText = count;
            this.renderRequests(data);
        });
    }

    renderRequests(data) {
        const container = document.getElementById('teacher-speak-requests');
        if (!container) return;

        const pending = Object.entries(data).filter(([k, v]) => v.status === 'pending');

        if (pending.length === 0) {
            container.innerHTML = '<div class="text-center py-8 opacity-40"><i class="fa-solid fa-microphone-lines text-2xl mb-2 text-gray-400"></i><p class="text-xs text-gray-500">No speak requests yet</p></div>';
            return;
        }

        container.innerHTML = pending.map(([key, req]) => `
            <div class="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between mb-2">
                <div>
                    <p class="text-sm font-bold text-gray-900">${req.name}</p>
                    <p class="text-[10px] text-gray-400 uppercase font-black">Wants to speak</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="App.speakManager.denyRequest('${key}')" class="bg-gray-100 hover:bg-gray-200 text-gray-600 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95">
                        DENY
                    </button>
                    <button onclick="App.speakManager.approveRequest('${key}')" class="bg-green-500 hover:bg-green-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95">
                        APPROVE
                    </button>
                </div>
            </div>
        `).join('');
    }

    async approveRequest(requestId) {
        try {
            const { ref, update } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
            await update(ref(this.db, `${this.requestsRef}/${requestId}`), {
                status: 'approved'
            });
            this.app.showToast("Request approved", "success");
        } catch (e) {
            console.error("Approval failed", e);
            this.app.showToast("Failed to approve", "error");
        }
    }

    async denyRequest(requestId) {
        try {
            const { ref, update } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
            await update(ref(this.db, `${this.requestsRef}/${requestId}`), {
                status: 'denied'
            });
            this.app.showToast("Request denied", "info");
        } catch (e) {
            console.error("Denial failed", e);
            this.app.showToast("Failed to deny", "error");
        }
    }
}

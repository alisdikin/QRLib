const { createApp } = Vue;

createApp({
    data() {
        return {
            presets: [],
            currentPreset: 'vip',
            qrImage: null,
            qrsig: null,
            loading: false,
            status: { ret: '', msg: '' },
            logs: [],
            pollTimer: null,
            cookie: null,
            ticket: null, // For Mini Program
            nickname: '',
            copied: false,
            customAppId: '',
            loginSuccess: false
        }
    },
    mounted() {
        this.fetchPresets();
        this.log('System initialized. Ready for user input.', 'system');
    },
    methods: {
        log(msg, type = 'info') {
            const time = new Date().toLocaleTimeString('en-US', { hour12: false });
            this.logs.unshift({ time, msg, type });
        },

        async fetchPresets() {
            try {
                const res = await fetch('/api/presets');
                this.presets = await res.json();
                this.log(`Loaded ${this.presets.length} presets from server.`);
            } catch (e) {
                this.log('Failed to load presets: ' + e.message, 'error');
            }
        },

        selectPreset(key) {
            this.currentPreset = key;
            this.stopPolling();
            this.qrImage = null;
            this.qrsig = null;
            this.cookie = null;
            this.ticket = null; // Reset ticket
            this.status = { ret: '', msg: '' };
            this.customAppId = ''; // Reset custom AppID on switch? Maybe keep it.
            this.loginSuccess = false;
            // Auto-fill AppID from preset config
            const preset = this.presets.find(p => p.key === key);
            if (preset && preset.type === 'mp') {
                this.customAppId = preset.defaultAppId || '';
            } else {
                this.customAppId = '';
            }
            this.log(`Switched preset to: ${this.getCurrentPresetName()}`);
        },

        async fetchQRCode() {
            if (this.loading) return;
            this.loading = true;
            this.stopPolling();
            this.status = { ret: '', msg: 'Generating QR...' };
            this.cookie = null;
            this.ticket = null;
            this.qrImage = null;
            this.nickname = '';
            this.loginSuccess = false;

            try {
                this.log(`Requesting QR Code for ${this.currentPreset}...`);
                const res = await fetch('/api/qr/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ preset: this.currentPreset })
                });
                const data = await res.json();

                if (data.success) {
                    this.qrImage = data.qrcode;
                    this.qrsig = data.qrsig;
                    this.log('QR Code generated successfully.');
                    this.status = { ret: '', msg: 'Scan with QQ Mobile' };
                    this.startPolling();
                } else {
                    this.log('QR Generation Failed: ' + data.message, 'error');
                    this.status = { ret: '', msg: 'Generation Failed' };
                }
            } catch (e) {
                this.log('Network Error: ' + e.message, 'error');
                this.status = { ret: '', msg: 'Network Error' };
            } finally {
                this.loading = false;
            }
        },

        startPolling() {
            this.log('Started polling for login status...');
            this.pollTimer = setInterval(this.checkStatus, 2000);
        },

        stopPolling() {
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
                this.pollTimer = null;
                // this.log('Polling stopped.');
            }
        },

        async checkStatus() {
            if (!this.qrsig) return;

            try {
                const res = await fetch('/api/qr/check', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        qrsig: this.qrsig,
                        preset: this.currentPreset,
                        appid: this.customAppId || undefined
                    })
                });
                const data = await res.json();

                if (data.success) {
                    // Update status text
                    if (data.msg && data.msg !== this.status.msg) {
                        this.status.msg = data.msg;
                        this.log(`Status update: ${data.msg}`);
                    }

                    if (data.nickname) this.nickname = data.nickname;

                    // Success Case
                    if (data.ret === '0') {
                        this.stopPolling();
                        this.log('Login Successful!');
                        this.loginSuccess = true;
                        this.qrImage = null; // Clear QR code

                        // New Data Format
                        this.cookie = null; // reused variable name for display text, or we can change logic
                        // Let's format the display string
                        const parts = [];
                        if (data.uin) parts.push(`UIN: ${data.uin}`);
                        if (data.code) parts.push(`CODE: ${data.code}`);
                        if (data.ticket) parts.push(`TICKET: ${data.ticket}`);

                        this.cookie = parts.join('\n'); // Display formatted text
                        this.log(`Got Code/UIN.`);
                    }
                    // Expired Case
                    else if (data.ret === '65') {
                        this.stopPolling();
                        this.log('QR Code expired.', 'error');
                    }
                }
            } catch (e) {
                console.error(e);
            }
        },

        copyCookie() {
            const content = this.cookie || this.ticket;
            if (!content) return;

            navigator.clipboard.writeText(content).then(() => {
                this.log('Copied to clipboard!');
                this.copied = true;
                setTimeout(() => this.copied = false, 2000);
            });
        },

        // Helper Methods for UI
        getCurrentPresetName() {
            const p = this.presets.find(p => p.key === this.currentPreset);
            return p ? p.name : 'Unknown';
        },

        getCurrentPresetDesc() {
            const p = this.presets.find(p => p.key === this.currentPreset);
            return p ? p.description : '';
        },

        getIconForPreset(key) {
            const map = {
                'vip': 'ph-crown',
                'qzone': 'ph-star',
                'music': 'ph-music-note',
                'wegame': 'ph-game-controller',
                'val': 'ph-crosshair',
                'miniprogram': 'ph-code',
                'farm': 'ph-plant'
            };
            return 'ph ' + (map[key] || 'ph-app-window');
        }
    }
}).mount('#app');

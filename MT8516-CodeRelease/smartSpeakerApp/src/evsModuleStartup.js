var fs = require('fs');
var EventEmitter = require('events');
var iFlyosUtil = require('iflyos_util');
var EVSOTAMgr = require('./platforms/' + iflyosPlatform + '/evsOTAMgr').EVSOTAMgr;
var LightType = require('./lightType').LightType;
var logger = require('logger').getLogger('ModuleStartup');


/**
 * EVS program startup manager implementation
 * @class
 */
class EVSModuleStartup extends EventEmitter {
    /**
     * Create EVSNetworkMgr instance
     * @param {json} cfg - configurationis
     */
    constructor(cfg, authMgr, netMonitor, soundPlayer, ledMgr) {
        super();

        this.cfg = cfg;
        this.authMgr = authMgr;
        this.soundPlayer = soundPlayer;

        this.ledMgr = ledMgr;
        this.crash = false;

        this.authTimer = null;
        this.status = 'unauthorized';
        this.otaMgr = new EVSOTAMgr(cfg);

        netMonitor.on('timestamp', this._onTimestamp.bind(this));
    }

    setCrash(crash) {
        this.crash = crash;
    }

    start() {
        Promise.resolve().then(() => {
            return this.otaMgr.start();
        }).then((v) => {
            this.currentFirmwareVersion = v;
            return this._checkAuth();
        }).then(() => {
            logger.info('startup ready with auth status:', this.status);
            this.emit('ready', this.status);

            var latestVerStr = '';
            try {
                latestVerStr = fs.readFileSync(this.cfg.dbPath + '/ver').toString();
            }catch (e) {
                latestVerStr = '';
            }
            logger.info('latest ver:', latestVerStr, 'current ver', this.currentFirmwareVersion);
            if (latestVerStr && latestVerStr != this.currentFirmwareVersion) {
                this.emit('ota_success_tip');
            }
            if (latestVerStr != this.currentFirmwareVersion) {
                fs.writeFileSync(this.cfg.dbPath + '/ver', this.currentFirmwareVersion);

            }
            // this.otaMgr.updateIfHasNewVersion();

        });
    }

    _checkAuth() {
        return new Promise((resolve) => {
            var onceAuthFail = (err) => {
                logger.error('authorize fail:', err);
                this._clearTimer();
                if (err.message === 'invalid_refresh_token') {
                    this.soundPlayer.play('tts_system_token_fail');
                    this.status = 'auth_expired';
                    resolve();
                } else {
                    this.soundPlayer.play('tts_system_network_disconnected'); 
                    this.ledMgr.openLight(LightType.NETFAILED);
                    this.status = 'auth_unknown';
                    resolve();
                }
                this.ledMgr.openLight(LightType.NETDISSCONN);
            };

            var onceAuthSuccess = (token) => {
                this.ledMgr.closeAllLight();
                logger.info('auth success:', token);
                this._clearTimer();
                this.status = 'authorized';
                this.otaMgr.updateIfHasNewVersion();
                resolve();
            };

            this.authMgr.once('fail', onceAuthFail);
            this.authMgr.once('access_token', onceAuthSuccess);

            this.authMgr.getRefreshToken((token) => {
                if (!token) {
                    if (!this.crash) {
                        this.soundPlayer.play('tts_system_welcome_init', () => {
                            this.ledMgr.openLight(LightType.BOOTEND);
                        });
                    }
                    resolve();
                } else {
                    if (!this.crash) {
                        this.soundPlayer.play('sound_effect_ui_boot');
                    }
                    setTimeout(() => {
                        this.authMgr.authWithRefreshToken(token);
                    }, 3000);
                    this.authTimer = setTimeout(() => {
                        this.authMgr.removeListener('access_token', onceAuthSuccess);
                        onceAuthFail(new Error('network_error'));
                    }, 30000);
                }
            });
        });
    }

    _onTimestamp(timestamp) {
        // timestamp += 8 * 3600;
        var date = new Date(timestamp * 1000).toDateString();
        var time = new Date(timestamp * 1000).toTimeString().substr(0, 8);
        iFlyosUtil.system('date -s "' + date + ' ' + time + '"');
        logger.info('update system time:', date, time);
    }

    _clearTimer() {
        if (this.authTimer) {
            clearTimeout(this.authTimer);
            this.authTimer = null;
        }
    }
}

module.exports.EVSModuleStartup = EVSModuleStartup;

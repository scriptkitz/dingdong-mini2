var EventEmitter = require('events');
var EVSNetworkMgr = require('./evsNetworkMgr').EVSNetworkMgr;
var LightType = require('./lightType').LightType;
var logger = require('logger').getLogger('ModuleConfig');

/**
 * EVS program startup manager implementation
 * @class
 */
class EVSModuleConfig extends EventEmitter  {
    /**
     * Create EVSNetworkMgr instance
     * @param {EVSNetworkMgr} networkMgr
     * @param {EVSAuthorizeMgr} authMgr
     * @param {netMonitor} netMonitor
     * @param {EVSSoundPlayer} soundPlayer
     */
    constructor(cfg, authMgr, soundPlayer, ledMgr) {
        super();

        this.networkMgr = new EVSNetworkMgr(cfg);
        this.authMgr = authMgr;
        this.soundPlayer = soundPlayer;
        this.authTimer = null;
        this.isConfiging = false;
        this.ledMgr = ledMgr;

        this.networkMgr.on('status', this._onNetworkStatus.bind(this));
        this.networkMgr.on('fail', this._onNetworkFail.bind(this));
        this.networkMgr.on('ok', this._onNetworkSuccess.bind(this));
        this.authMgr.on('fail', this._onAuthFail.bind(this));
        this.authMgr.on('access_token', this._onAuthSuccess.bind(this));
    }

    config() {
        this.isConfiging = true;
        this.authMgr.reset();
        this.networkMgr.start();
        this._clearTimer();
        this.emit('config_start');
    }

    _onNetworkStatus(status) {
        if (this.isConfiging) {
            if (status === 'ready') {
                this.soundPlayer.play('tts_state_network_mode_on');
                this.ledMgr.openLight(LightType.NETWAIT);
            } else if (status === 'accept') {
                this.soundPlayer.play('tts_state_bluetooth_connected');
            } else if (status === 'config') {
                if (iflyosPlatform === "MTK8516-EDU" || iflyosPlatform === "MTK8516-GEEK") {
                    var randomIndex = Math.floor(Math.random() * (3 - 1 + 1) + 1);
                    var tts = 'tts_system_network_connecting_' + randomIndex;
                    this.soundPlayer.play(tts);
                } else {
                    this.soundPlayer.play('tts_system_network_connecting');
                }
            }
        }
    }

    _onNetworkFail(err) {
        if (this.isConfiging) {
            logger.error('network fail:', err);
            this.ledMgr.openLight(LightType.NETFAILED);
            if (err.message === 'accept_timeout' || err.message === 'data_timeout') {
                this.soundPlayer.play('tts_system_network_fail_5');
            } else if (err.message === 'disconnect') {
                this.soundPlayer.play('tts_state_bluetooth_disconnected');
            } else if (err.message === 'wrong_data' || err.message === 'config_fail') {
                this.soundPlayer.play('tts_system_network_wrong_password');
            } else {
                this.soundPlayer.play('tts_system_network_fail_4');
            }

            this.networkMgr.stop();
            this.isConfiging = false;
            this.emit('config_end', err);
        }
    }

    _onNetworkSuccess(code) {
        if (this.isConfiging) {
            logger.info('network success:', code);
            this.networkMgr.stop();

            this.authMgr.authWithCode(code);
            this.authTimer = setTimeout(() => {
                this._onAuthFail(new Error('network_error'));
            }, 30000);
        }
    }

    _onAuthFail(err) {
        if (this.isConfiging) {
            logger.error('authorize fail:', err);
            this.authMgr.reset();
            this._clearTimer();

            if (err.message === 'invalid_refresh_token') {
                this.soundPlayer.play('tts_system_token_fail')
            } else {
                this.soundPlayer.play('tts_system_network_fail_1');
            }

            this.isConfiging = false;
            this.ledMgr.openLight(LightType.NETFAILED);
            this.emit('config_end', err);
        }
    }

    _onAuthSuccess(token) {
        if (this.isConfiging) {
            logger.info('auth success:', token);
            this._clearTimer();
            this.isConfiging = false;
            this.ledMgr.openLight(LightType.NETSUCCESS);
            this.emit('config_end');
        }
    }

    _clearTimer() {
        if (this.authTimer) {
            clearTimeout(this.authTimer);
            this.authTimer = null;
        }
    }
}

module.exports.EVSModuleConfig = EVSModuleConfig;

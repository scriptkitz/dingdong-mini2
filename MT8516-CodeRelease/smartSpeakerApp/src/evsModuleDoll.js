var EventEmitter = require('events');
var EasyCurl = require('curl');
var DollMgr = require('./platforms/' + iflyosPlatform + '/dollMgr').DollMgr;
var logger = require('logger').getLogger('ModuleDoll');
var LightType = require('./lightType').LightType;
var md5 = require('./md5');

class EVSModuleDoll extends EventEmitter {
    constructor(moduleStartup, moduleConfig, moduleInteraction, cxtMgr, authMgr, soundPlayer, ledCtrl, ledMgr) {
        super();

        this.moduleInteraction = moduleInteraction;
        this.soundPlayer = soundPlayer;
        this.ledCtrl = ledCtrl;
        this.ledMgr = ledMgr;
        this.dollMgr = new DollMgr();

        moduleStartup.once('ready', this._onceStartupReady.bind(this));
        moduleConfig.on('config_start', this._onConfigStart.bind(this));
        moduleConfig.on('config_end', this._onConfigEnd.bind(this));
        moduleInteraction.on('client', this._onClientStatus.bind(this));
        cxtMgr.addContextProvider(this._getContext.bind(this));
        authMgr.on('access_token', this._onAccessToken.bind(this));

        this.dollMgr.on('init', this._onDollInit.bind(this));
        this.dollMgr.on('preparing', this._onDollPerparing.bind(this));
        this.dollMgr.on('cancel', this._onDollCancel.bind(this));
        this.dollMgr.on('doll_set', this._onDollSet.bind(this));
        this.dollMgr.on('doll_unset', this._onDollUnset.bind(this));

        this.authStatus = null;
        this.dollStatus = 'unplugged';

        this.isConnectEVS = false;
        this.isFirstConnect = true;
        this.isEnabled = false;
        this.token = null;

        this.doll = null;
        this.hiSoundFile = null;
        this.byeSoundFile = null;
        this.caeResFile = null;
    }

    _onceStartupReady(status) {
        this.authStatus = status;
        this.dollMgr.start();
    }

    _getContext() {
        var cxt = {
            interceptor: {
                version : '1.0',
                doll_type : 'null',
                doll_id : 'null'
            }
        };

        if (this.dollStatus === 'ready' && this.isEnabled) {
            cxt.interceptor.doll_id = this.doll.id.toString();
            cxt.interceptor.doll_type = this.doll.type.toString();
        }
        return cxt;
    }

    _onAccessToken(token) {
        this.token = token;
        this.dollMgr.updateToken(token);
    }

    _onClientStatus(status) {
        if (status === 'connected') {
            this.isConnectEVS = true;
            if (this.isFirstConnect) {
                this.isFirstConnect = false;
                if (this.dollStatus === 'ready') {
                    this.isEnabled = true;
                    this.moduleInteraction.reloadRes(this.caeResFile);
                    this.soundPlayer.playFile(this.hiSoundFile, () => {
                        this.ledMgr.closeLight(LightType.DOLLDOWNLOADRES);
                        this.ledMgr.closeLight(LightType.DOLLSET);
                    });
                    this._dollReport();
                } else if (this.dollStatus === 'plugged') {
                    this.moduleInteraction.enableWakeup(false);
                    this.soundPlayer.play('tts_system_service_in_preparation');
                    // this.ledCtrl.downloading();
                    this.ledMgr.openLight(LightType.DOLLDOWNLOADRES);
                    this.dollMgr.startDownloadRes();
                }
            }
            
        } else {
            this.isConnectEVS = false;
        }
    }

    _onDollInit(info) {
        if (info === 'not_present') {
            //没有玩偶
            logger.info('doll init: not_present');
            this.dollStatus = 'unplugged';
        } else if (info && info.hiSoundFile) {
            //有玩偶且资源已经存在
            logger.info('doll init:', info.hiSoundFile);
            this.doll = info.doll;
            this.hiSoundFile = info.hiSoundFile;
            this.byeSoundFile = info.byeSoundFile;
            this.caeResFile = info.caeResFile;
            this.dollStatus = 'ready';
        } else {
            //有玩偶但资源不存在
            logger.info('doll init: need download res');
            this.dollStatus = 'plugged';
        }
    }

    _onDollPerparing() {
        logger.info('doll preparing');
        if (this.dollStatus !== 'plugged') {
            this.dollStatus = 'plugged';
            if (this.isConnectEVS) {
                this.moduleInteraction.enableWakeup(false);
                this.soundPlayer.play('tts_system_service_in_preparation');
                // this.ledCtrl.downloading();
                this.ledMgr.openLight(LightType.DOLLDOWNLOADRES);
            }
        }
    }

    _onDollCancel(err) {
        logger.info('doll cancel:', err);
        //this.ledCtrl.back2Idle();
        this.ledMgr.closeLight(LightType.DOLLDOWNLOADRES);
        this.moduleInteraction.enableWakeup(true);
        if (!this.isConfiging) {
            if (this.authStatus === 'unauthorized') {
                this.soundPlayer.play('tts_system_welcome');
            } else if (this.authStatus === 'auth_fail') {
                this.soundPlayer.play('tts_system_network_fail_1');
            } else if (this.authStatus === 'auth_unknown') {
                this.soundPlayer.play('tts_system_network_disconnected');
            } else if (this.authStatus === 'auth_expired') {
                this.soundPlayer.play('tts_system_token_fail');
            } else if (!this.isConnectEVS) {
                this.soundPlayer.play('tts_system_network_disconnected');
            } else if (err === 'doll' || err === 'server') {
                this.dollStatus = 'doll_error';
                this.soundPlayer.play('tts_state_adam_disconnected');
            } else if (err === 'network') {
                this.dollStatus = 'network_error';
                this.soundPlayer.play('tts_system_network_retry');
            } else {
                this.dollStatus = 'error';
                logger.error('unknown error type:', err);
            }
        }
    }

    _onDollSet(info) {
        logger.info('doll set');
        this.doll = info.doll;
        this.hiSoundFile = info.hiSoundFile;
        this.byeSoundFile = info.byeSoundFile;
        this.caeResFile = info.caeResFile;
        this.dollStatus = 'ready';
        if (!this.isConfiging) {
            this.isEnabled = this.isConnectEVS;
            if (this.isConnectEVS) {
                this.moduleInteraction.enableWakeup(true);
                // this.ledCtrl.dollSet();
                this.ledMgr.openLight(LightType.DOLLSET);
                this.moduleInteraction.stopAlert();
                this.moduleInteraction.stopAudio();
                this.moduleInteraction.reloadRes(this.caeResFile);
                this.soundPlayer.playFile(info.hiSoundFile, () => {
                    // this.ledCtrl.normal();
                    this.ledMgr.closeLight(LightType.DOLLSET);
                });
                this._dollReport();
            } else {
                this._onDollCancel();
            }
        }
    }

    _onDollUnset(info) {
        logger.info('doll unset');
        this.dollStatus = 'unplugged';

        if (this.isEnabled) {
            this.moduleInteraction.reloadRes('/usr/share/iflyos/ivw/xiaofeixiaofei.bin');
            this._dollReport();
        }

        if (!this.isConfiging && this.isEnabled) {
            this.moduleInteraction.enableWakeup(true);
            this.moduleInteraction.stopAlert();
            this.moduleInteraction.stopAudio();
            this.ledMgr.openLight(LightType.SPEAKING);
            this.soundPlayer.playFile(info.byeSoundFile, () => {
                this.ledMgr.closeLight(LightType.SPEAKING);
            });
        }
    }

    _onConfigStart() {
        this.isConfiging = true;
        this.isFirstConnect = true;
        this.authStatus = 'unauthorized';
    }

    _onConfigEnd(err) {
        this.isConfiging = false;
        this.authStatus = err ? 'auth_fail' : 'authorized';
    }

    _dollReport() {
        var reportUrl;
        if (this.dollStatus === 'ready') {
            reportUrl = 'https://adam.iflyos.cn/doll/v2/ready';
        } else if (this.dollStatus === 'unplugged') {
            reportUrl = 'https://adam.iflyos.cn/doll/v2/remove';
        } else {
            return;
        }

        var timeVal = parseInt(Date.now() / 1000).toString();
        var randVal = this.dollMgr.getRandStr(32);
        var key = '8a09e4ee3754a5d01f6413930e254e20';
        var sign = timeVal + randVal + key;
        var md5val = md5.hex_md5(sign);
    
        logger.info('report url:', reportUrl);
        var curl = new EasyCurl();
        curl.addHeader('Content-Type: application/json; charset=utf8');
        curl.addHeader('Authorization: Bearer ' + this.token);
        curl.addHeader("X-Timestamp: " + timeVal);
        curl.addHeader("X-Nonce: " + randVal);
        curl.addHeader("X-Sign: " + md5val);
        curl.setOpt(EasyCurl.CURLOPT_URL, reportUrl);
        curl.setOpt(EasyCurl.CURLOPT_TIMEOUT, 10);
        curl.setOpt(EasyCurl.CURLOPT_POST, 1);
        curl.setOpt(EasyCurl.CURLOPT_POSTFIELDSIZE, 0);
        curl.setOpt(EasyCurl.CURLOPT_POSTFIELDS, '');

        curl.perform((err, response) => {
            if (err) {
                logger.error(reportUrl, err);
                return;
            }
            var respTxt = response.toString();
            if (this.dollStatus === 'ready') {
                logger.info('report doll ready', respTxt);
            } else if(this.dollStatus === 'unplugged') {
                logger.info('report doll unset', respTxt);
            }
        });
    }
}

module.exports.EVSModuleDoll = EVSModuleDoll;
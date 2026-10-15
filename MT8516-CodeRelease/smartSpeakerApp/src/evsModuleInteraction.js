var EventEmitter = require('events');
var iFlyosUtil = require('iflyos_util');
var Voice = require('./audio.js').Voice;
var EVSClient = require('./evsClient').EVSClient;
var EVSCapSystem = require('./evsCapSystem').EVSCapSystem;
var EVSCapSpeaker = require('./evsCapSpeaker').EVSCapSpeaker;
var EVSCapRecognizer = require('./evsCapRecognizer').EVSCapRecognizer;
var EVSCapInterceptor = require('./evsCapInterceptor').EVSCapInterceptor;
var EVSCapAudioPlayer = require('./evsCapAudioPlayer').EVSCapAudioPlayer;
var EVSTTSPlayer = require('./evsTTSPlayer').EVSTTSPlayer;
var EVSAlertPlayer = require('./evsAlertPlayer').EVSAlertPlayer;
var EVSAudioPlayer = require('./evsAudioPlayer').EVSAudioPlayer;
var EVSEffectPlayer = require('./platforms/' + iflyosPlatform + '/evsEffectPlayer').EVSEffectPlayer;
var getOta = require('./platforms/' + iflyosPlatform + '/evsOTAMgr').get;
var EVSButtonControl = require('./platforms/' + iflyosPlatform + '/evsButtonControl').EVSButtonControl;
var ChannelType = require('./evsAudioMgr').ChannelType;
var FocusState = require('./evsAudioMgr').FocusState;
var LightType = require('./lightType').LightType;
var PlayerActivity = require('./evsMediaPlayer').PlayerActivity;
var logger = require('logger').getLogger('ModuleInteraction');

var playOtaSuccessTip;

class EVSModuleInteraction extends EventEmitter {
    constructor(cfg, moduleStartup, moduleConfig, cxtMgr, authMgr, audioMgr, netMonitor, soundPlayer, ledMgr) {
        super();

        this.moduleConfig = moduleConfig;
        this.cxtMgr = cxtMgr;
        this.authMgr = authMgr;
        this.netMonitor = netMonitor;
        this.soundPlayer = soundPlayer;

        this.led = ledMgr;

        playOtaSuccessTip = false;

        // 初始化context管理模块，client管理模块
        var serverUrl = 'ws://ivs.iflyos.cn/embedded/v1';
        this.client = new EVSClient(serverUrl, cfg.deviceID, this.cxtMgr);

        // 初始化各个播放器
        this.ttsPlayer = new EVSTTSPlayer(audioMgr, this.client, this.led);
        this.alertPlayer = new EVSAlertPlayer(audioMgr, this.client, this.led);
        this.audioPlayer = new EVSAudioPlayer(audioMgr, this.client, this.cxtMgr);
        this.effectPlayer = new EVSEffectPlayer(cfg.soundDir);

        // 初始化录音模块
        this.voice = new Voice({
            snowboyRes: cfg.snowboyRes,
            snowboyModel: cfg.snowboyModel,
            voiceFIFOPath: cfg.ivsRecord,
            caeResPath: cfg.caeResPath
        });
        this.voice.caeAuth(cfg.deviceID);

        // 初始化端能力
        this.capSystem = new EVSCapSystem(this.client, this.cxtMgr);
        this.capInterceptor = new EVSCapInterceptor(this.client, this.cxtMgr, this.capSystem);
        this.capSpeaker = new EVSCapSpeaker(this.client, this.cxtMgr, this.capSystem, this.led);
        this.capRecognizer = new EVSCapRecognizer(this.client, this.cxtMgr, this.capSystem, audioMgr, this.voice, this.led);
        this.capAudioPlayer = new EVSCapAudioPlayer(this.client, this.capRecognizer,
            this.ttsPlayer, this.alertPlayer, this.audioPlayer);

        // 初始化按键控制模块
        this.btnCtrl = new EVSButtonControl();

        this.capSpeaker.addAudioPlayer(this.soundPlayer);
        this.capSpeaker.addAudioPlayer(this.ttsPlayer);
        this.capSpeaker.addAudioPlayer(this.alertPlayer);
        this.capSpeaker.addAudioPlayer(this.audioPlayer);
        this.capSpeaker.addAudioPlayer(this.effectPlayer);

        this.voice.enableWakeup(true);
        this.voice.enableCapture(true);
        this.boot = true;
        this.voice.setBoot(this.boot);

        moduleStartup.once('ready', this._onceStartupReady.bind(this));
        getOta().once('ota_update_progress', ver => {
            this.client.request({
                header: {
                    name: 'system.software_update_state_sync'
                },
                payload: {
                    state: "STARTED",
                    version_name: "" + ver.version_id,
                    update_description: ver.description
                }
            });
        });
        moduleStartup.once('ota_success_tip', () => {
            playOtaSuccessTip = true
            this.led.openLight(LightType.UPDATESUCCESS);
            this.soundPlayer.play('tts_state_upgraded');
            this.client.request({
                header: {
                    name: 'system.software_update_state_sync'
                },
                payload: {
                    state: "FINISHED"
                }
            });
        });
        moduleConfig.on('config_start', this._onConfigStart.bind(this));
        moduleConfig.on('config_end', this._onConfigEnd.bind(this));

        this.voice.on('wakeup', this._onWakeup.bind(this));
        this.authMgr.once('access_token', this._onceAccessToken.bind(this));

        this.btnCtrl.on('PLAY_PAUSE', this._onPlayPause.bind(this));
        this.btnCtrl.on('VOL_DOWN', this._onVolumeDown.bind(this));
        this.btnCtrl.on('VOL_UP', this._onVolumeUp.bind(this));
        this.btnCtrl.on('VOL_MUTE', this._onVolumeMute.bind(this));
        this.btnCtrl.on('NET_CFG', this._onConfigWifi.bind(this));
        this.btnCtrl.on('DEV_MODE', this._onDevelopMode.bind(this));
        this.btnCtrl.on('RESTORE', this._onRestore.bind(this));
        this.btnCtrl.on('PLAY_OTA_TIP', ()=>{
            if(!this.otaTipPlaying) {
                this.otaTipPlaying = true;
                this.led.openLight(LightType.UPDATING);
                this.soundPlayer.play('tts_state_upgrading', ()=>this.otaTipPlaying = false);
            }
        });

        getOta().on('ota_start_tip', ()=>{

            this.led.openLight(LightType.UPDATING);
            this.stopAlert()
            this.stopAudio()

            this.soundPlayer.play('tts_state_upgrade_ready');
        });
        getOta().on('ota_fail_tip', ()=>{
            this.led.openLight(LightType.UPDATEFAILED);
            this.soundPlayer.play('tts_state_upgrade_retry');
        });

        audioMgr.on(ChannelType.TTS, (state) => {
            this.isTTSPlaying = !(state === FocusState.NONE);
        });
        audioMgr.on(ChannelType.ALERT, (state) => {
            this.isAlertPlaying = !(state === FocusState.NONE);
        });
        audioMgr.on(ChannelType.CONTENT, (state) => {
            this.isAudioPlaying = !(state === FocusState.NONE);
        });

        this.crash = false;

        this.authStatus = 0;
        this.isStartupReady = false;
        this.isConfiging = false;
        this.isConnectEVS = false;
        this.isFirstConnect = true;
        this.isMicDisabled = false;
        this.isTTSPlaying = false;
        this.isAlertPlaying = false;
        this.isAudioPlaying = false;
    }

    setCrash(crash) {
        this.crash = crash;
    }

    setPlayerState(playerAlive) {
        this.ttsPlayer.setPlayerState(playerAlive);
        this.alertPlayer.setPlayerState(playerAlive);
        this.audioPlayer.setPlayerState(playerAlive);
        this.effectPlayer.setPlayerState(playerAlive);
        this.soundPlayer.setPlayerState(playerAlive);
    }

    reloadRes(filePath) {
        this.voice.realodCaeRes(filePath);
    }

    stopAlert() {
        this.alertPlayer.stop();
    }

    stopAudio() {
        this.audioPlayer.stop();
    }

    enableWakeup(enable) {
        this.voice.enableWakeup(enable);
    }

    _onceStartupReady(status) {
        this.isStartupReady = true;
        this.authStatus = status;

        this.authMgr.once('fail', (err) => {
            if (err.message === 'invalid_refresh_token') {
                this.soundPlayer.play('tts_system_token_fail');
                this.authStatus = 'auth_expired';
            }
        });
    }

    _onConfigStart() {
        this.crash = false;
        this.isConfiging = true;
        this.isFirstConnect = true;
        this.isMicDisabled = false;
        this.authStatus = 'unauthorized';
        this.client.stop();
    }

    _onConfigEnd(err) {
        this.isConfiging = false;
        this.authStatus = err ? 'auth_fail' : 'authorized';
    }

    // 开机后第一次获取到access token
    _onceAccessToken(token) {
        // 完成client初始化工作
        this.client.once('ready', () => {
            logger.info('client is ready');
            this.client.startServerConnection();
        });

        // 完成和EVS服务器的连接
        this.client.on('connected', () => {
            logger.info('client is connected');
            this.isConnectEVS = true;
            this.led.closeLight(LightType.SYSTEMERROR);
            this.led.closeLight(LightType.NETFAILED);
            if (this.isFirstConnect) {
                // 启动后或者重新配网后首次连接服务器
                this.isFirstConnect = false;
                //doll manage the 'tts_我已联网' playing for adam
                if (iflyosProduct !== 'adam') {
                    if (playOtaSuccessTip) {
                        this.led.openLight(LightType.UPDATESUCCESS);
                        this.soundPlayer.play('tts_state_upgraded', () => {
                            this.emit('client', 'connected');
                            this.boot = false;
                            this.voice.setBoot(this.boot);
                        });
                        playOtaSuccessTip = false
                    } else {
                        if (!this.crash) {
                            this.led.closeLight(LightType.NETDISSCONN);
                            this.soundPlayer.play('tts_system_network_connected', () => {
                                this.emit('client', 'connected');
                                this.boot = false;
                                this.voice.setBoot(this.boot);
                            });
                        } else {
                            this.crash = false;
                            this.emit('client', 'connected');
                        }
                    }
                } else {
                    this.emit('client', 'connected');
                }

            } else {
                this.emit('client', 'connected');
            }
        });

        // 失去和EVS服务器的连接
        this.client.on('disconnected', () => {
            logger.info('client is disconnected');
            this.isConnectEVS = false;
            this.emit('client', 'disconnected');
        });

        // 当设备被用户在app中删除时
        this.capSystem.on('device_removed', () => {
            this.authStatus = 'auth_expired';
            this.soundPlayer.play('tts_system_token_fail');
            this.client.stop();
            this.led.openLight(LightType.SYSTEMERROR);
        });

        // 旧的access token失效后，重新获取到新的并更新至client
        this.authMgr.on('access_token', (token) => {
            logger.info('update access token with ', token);
            this.authStatus = 'authorized';
            this.client.updateToken(token);
            this.client.startServerConnection();
        });

        // 网络恢复时client重连
        this.netMonitor.on('ok', () => {
            logger.info('network is ok');
            if (this.authStatus === 'authorized') {
                this.client.startServerConnection();
                this.led.closeLight(LightType.NETFAILED);
            }
        });

        // 网络断开时client停止
        this.netMonitor.on('fail', () => {
            logger.info('network is fail, stop client');
            this.client.stop();
            if (this.isAudioPlaying) {
                this.led.openLight(LightType.NETFAILED);
                this.soundPlayer.play('tts_system_network_disconnected');
            }
        });

        this.capRecognizer.on('idle', () => this.emit('dialog', 'idle'));
        this.capRecognizer.on('listening', () => this.emit('dialog', 'listening'));
        this.capRecognizer.on('thinking', () => this.emit('dialog', 'thinking'));

        // 启动程序初始化工作
        this.client.updateToken(token);
        this.client.startLocalInit();
        this.authStatus = 'authorized';
    }

    _onWakeup(params) {
        logger.info('wakeup', JSON.stringify(params));
        if (!this.isStartupReady) {
            this.soundPlayer.play('tts_system_boot_in_preparation');
        } else if (this.isConfiging) {
            logger.info('ignore wakeup for wifi configuring and authorizing');
        } else if (this.isMicDisabled) {
            logger.info('mic has been disabled');
        } else if (getOta().getStatus() != 'idle'){
            this.led.openLight(LightType.UPDATING);
            this.soundPlayer.play('tts_state_upgrading');
        } else if (this.authStatus === 'unauthorized') {
            this.soundPlayer.play('tts_system_welcome');
        } else if (this.authStatus === 'auth_expired') {
            this.led.openLight(LightType.SYSTEMERROR);
            this.soundPlayer.play('tts_system_token_fail');
        } else if (this.authStatus === 'auth_fail') {
            this.soundPlayer.play('tts_system_network_fail_1');
        } else if (this.authStatus === 'auth_unknown') {
            this.led.openLight(LightType.NETFAILED);
            this.soundPlayer.play('tts_system_network_disconnected');
        } else if (!this.isConnectEVS) {
            this.led.openLight(LightType.NETFAILED);
            this.soundPlayer.play('tts_system_network_disconnected');
        } else {
            this.emit('wakeup', params);
            this.led.closeLight(LightType.NETFAILED);
            this.led.closeLight(LightType.SYSTEMERROR);
            // if (this.isAlertPlaying) {
            //     logger.info('alert is playing, stop alert first');
            //     this.alertPlayer.stop();
            // }

            if (this.soundPlayer.getVolume() === 0) {
                this.capSpeaker.updateVolume(10, true);
            }
            if (iflyosPlatform === "MTK8516-EDU" || iflyosPlatform === "MTK8516-GEEK") {
                var randomIndex = Math.floor(Math.random() * (2 - 1 + 1) + 1);
                var tts = 'sound_effect_ui_wakesound_' + randomIndex;
                this.effectPlayer.play(tts);
            } else {
                this.effectPlayer.play('sound_effect_ui_wakesound_1');
            }
            if (iflyosPlatform === "MTK8516-GEEK") {
                var positon = params;
                this.capRecognizer.setPositon(positon);
            }
            this.capRecognizer.recognize();

        }
    }

    _onPlayPause() {
        logger.info('BTN PLAY_PAUSE');
        if (this.isAlertPlaying && (this.alertPlayer.playerState === PlayerActivity.PLAYING || this.alertPlayer.playerState === PlayerActivity.PAUSED)) {
            this.alertPlayer.stop();
        } else if (this.isAudioPlaying && (this.audioPlayer.playerState === PlayerActivity.PLAYING || this.audioPlayer.playerState === PlayerActivity.PAUSED)) {
            this.audioPlayer.stop();
        } else {
            if (this.isTTSPlaying) {
                this.ttsPlayer.stop();
            }

            if (iflyosProduct === 'adam' || iflyosProduct === 'adam-edu'
                || iflyosPlatform === 'MTK8516-GEEK') {
                // 由于亚当只有一个按键，所以在设备没有播放情况下，做麦克风禁用功能
                this._onVolumeMute();
            } else {
                this.capRecognizer.nlp('继续播放');
            }
        }
    }

    _onVolumeDown() {
        logger.info('BTN VOL_DOWN');
        if (iflyosPlatform === "MTK8516-EDU" && this.isAlertPlaying) {
            this.alertPlayer.stop();
        } else {
            this.capSpeaker.adjustVolume(-10);
            var volumeLevel = parseInt(this.capSpeaker.getVolume() / 10);
            this.led.openLight(LightType.VOLUMEDOWN, volumeLevel);
        }
    }

    _onVolumeUp() {
        logger.info('BTN VOL_UP');
        if (iflyosPlatform === "MTK8516-EDU" && this.isAlertPlaying) {
            this.alertPlayer.stop();
        } else {
            this.capSpeaker.adjustVolume(10);
            var volumeLevel = parseInt(this.capSpeaker.getVolume() / 10);
            this.led.openLight(LightType.VOLUMEUP, volumeLevel);
        }

    }

    _onVolumeMute() {
        logger.info('BTN VOL_MUTE');
        if (!this.isConfiging) {
            if (iflyosPlatform === "MTK8516-EDU" && this.isAlertPlaying) {
                this.alertPlayer.stop();
            } else {
                this.isMicDisabled = !this.isMicDisabled;
                this.emit('mic', this.isMicDisabled);
                if (this.isMicDisabled) {
                    this.led.openLight(LightType.MICDISABLE);
                    this.soundPlayer.play('tts_state_microphone_off');
                } else {
                    this.led.closeLight(LightType.MICDISABLE);
                    this.soundPlayer.play('tts_state_microphone_on');
                }
            }
        }
    }

    _onConfigWifi() {
        logger.info('BTN NET_CFG');
        this.moduleConfig.config();
    }

    _onDevelopMode() {
        logger.info('BTN DEV_MODE');
        if (this.isConfiging) {
            this.soundPlayer.play('tts_state_factory_mode_on');

            var adbCtrl = require('./adbController');
            adbCtrl.temporaryEnable();
        }
    }

    _onRestore() {
        logger.info('BTN RESTORE');
        if (this.isConfiging) {
            this.soundPlayer.play('tts_state_reset', () => {
                iFlyosUtil.system('rm -rf /data/iflyos/auth.db /data/doll /data/evs.log*');
                iFlyosUtil.system('rm -rf /data/etc/wificonnect.conf');
                iFlyosUtil.system('sync');
                iFlyosUtil.system('reboot -f');
            });
        }
    }
}

module.exports.EVSModuleInteraction = EVSModuleInteraction;
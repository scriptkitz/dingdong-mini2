var Log = require('logger');
Log.setLogLevel(Log.LOG_DEBUG);
Log.enableMilliSecond(true);
Log.setFileMaxKb(1024);
Log.setFileMaxNum(5);

var logger = Log.getLogger('main');
var proc = require('process');
var fs = require('fs');

var iFlyosUtil = require('iflyos_util');
var iflyos = require('iflyos');

var EVSContextMgr = require('./evsContextMgr').EVSContextMgr;
var EVSAuthorizeMgr = require('./evsAuthorizeMgr').EVSAuthorizeMgr;
var EVSAudioMgr = require('./evsAudioMgr').EVSAudioMgr;
var EVSSoundPlayer = require('./evsSoundPlayer').EVSSoundPlayer;
var InternetMonitor = require("./internetMonitor.js");
var LEDControl = require('./platforms/' + iflyosPlatform + '/iflyos_led').LEDControl;

var EVSModuleStartup = require('./evsModuleStartup').EVSModuleStartup;
var EVSModuleConfig = require('./evsModuleConfig').EVSModuleConfig;
var EVSModuleInteraction = require('./evsModuleInteraction').EVSModuleInteraction;
var EVSModuleLed = require('./evsModuleLed').EVSModuleLed;
var EVSModuleDoll = require('./evsModuleDoll').EVSModuleDoll;
var LedManager = require('./ledManager').LedManager;
var LightType = require('./lightType').LightType;

var cfg = {};
var argv = proc.argv.slice(1);
var playerAlive = false;
var crash = false;

// 检查配置文件
function argumentsCheck() {
    if (!argv[1]) {
        logger.error("usage: iotjs", argv[0], "configFile");
        proc.exit();
        return;
    }

    if (!fs.existsSync(argv[1])) {
        logger.error("config file", argv[1], "not exists");
        proc.exit();
        return;
    }

    if (fs.existsSync('/tmp/crash.txt')) {
        crash = true;
        iFlyosUtil.system('rm -rf /tmp/crash.txt');
    }

    var cfgStat = fs.statSync(argv[1]);
    if (!cfgStat.isFile()) {
        logger.error(argv[1], "is not a file");
        logger.error("usage: iotjs", argv[0], "configFile");
        proc.exit();
        return;
    }

    var cfgStr = fs.readFileSync(argv[1]).toString();
    cfg = JSON.parse(cfgStr);

    // 检查Client ID
    if (!cfg.clientID || cfg.clientID === "__CLIENT__ID__") {
        logger.error("wrong client id in config", argv[1]);
        proc.exit();
        return;
    }

    // 检查Client Secret
    if (!cfg.clientSecret) {
        logger.warn('client secret not set in config');
    }

    // 检查Device ID
    if (!cfg.deviceID) {
        logger.warn('device id not set in config');
    }

    // 检查数据存放目录
    if (!cfg.dbPath) {
        logger.error('missing dbPath in config');
        proc.exit();
        return;
    }

    if (!cfg.otaSecret) {
        logger.warn('otaSecret not set in config');
        cfg.otaSecret = '0ccdd4b39a2a9b89e47c67a823c82c5d3c059e2f';
    }

    // 检查音效文件目录
    if (!cfg.soundDir) {
        cfg.soundDir = '/iflyos/sound_effect';
    }

    logger.info("use config", JSON.stringify(cfg));
}

argumentsCheck();
(cfg.preKill || []).forEach(p=>{
    iFlyosUtil.system('killall -9 ' + p);
});

var mac = null;
var sn = null;
var ledCtrl = null;
var router = iflyos.router || iflyos.initIPC();

function checkDeviceID() {
    if (!cfg.deviceID) {
        var xorpwd = 'this is a xor pwd';
        var mix = sn || (mac + '012345678');
        for (var i = 0; i < mix.length; i += 2) {
            var v = parseInt(mix.substr(i, 2), 16);
            var strV = (v ^ xorpwd.charCodeAt(i % xorpwd.length)).toString(16);
            if (strV.length == 1) {
                strV = '0' + strV;
            }
            cfg.deviceID += strV;
        }
        logger.info('xor-ed client:', cfg.deviceID);
    }
}
var moduleInteraction;

// 当系统初始化完成，开始程序初始化操作
function onSystemReady() {
    // 检查device id，若配置文件中未设置则根据mac和sn号生成
    checkDeviceID();

    // 初始化网络监测功能、授权功能
    var netMonitor = new InternetMonitor();
    var authMgr = new EVSAuthorizeMgr(cfg);

    // 初始化音频焦点管理功能、本地音效播放功能
    var audioMgr = new EVSAudioMgr();
    var soundPlayer = new EVSSoundPlayer(audioMgr, cfg.soundDir);

    // 初始化灯光模块
    var ledMgr = new LedManager();

    // 初始化Context Manager
    var cxtMgr = new EVSContextMgr();

    // 初始化各个流程逻辑模块
    var moduleStartup = new EVSModuleStartup(cfg, authMgr, netMonitor, soundPlayer, ledMgr);
    var moduleConfig = new EVSModuleConfig(cfg, authMgr, soundPlayer, ledMgr);
    moduleInteraction = new EVSModuleInteraction(cfg, moduleStartup, moduleConfig,
        cxtMgr, authMgr, audioMgr, netMonitor, soundPlayer, ledMgr);
    var moduleLed = new EVSModuleLed(moduleStartup, moduleConfig, moduleInteraction, ledCtrl, audioMgr);
    if (iflyosProduct === 'adam' || iflyosPlatform === 'MTK8516-GEEK') {
        var moduleDoll = new EVSModuleDoll(moduleStartup, moduleConfig, moduleInteraction,
            cxtMgr, authMgr, soundPlayer, ledCtrl, ledMgr);
    }

    if (!crash) {
        ledMgr.openLight(LightType.BOOTING);
    }
    moduleStartup.setCrash(crash);
    moduleInteraction.setCrash(crash);
    moduleStartup.start();
    netMonitor.start();
}

function initNetwork() {
    return new Promise((resolve, reject) => {
        if (iflyosPlatform === 'LinuxHost') {
            resolve('ok');
        } else {
            var macPuller = setInterval(() => {
                mac = iFlyosUtil.getWifiMac('wlan0');
                if (mac) {
                    clearInterval(macPuller);
                    logger.info('wlan mac is', mac);
                    resolve();
                }
            }, 100);
        }
    });
}

function initSN() {
    var snFile = '/data/sn.txt';
    return new Promise((resolve, reject) => {
        fs.readFile(snFile, (err, buf) => {
            if (!err && buf) {
                sn = buf.toString().trim();
                logger.info('sn is', sn);
            }
            resolve();
        });
    });
}

function initLEDCtrl() {
    return new Promise((resolve, reject) => {
        ledCtrl = new LEDControl(() => {
            ledCtrl.startup();
            logger.info('led is ready');
            resolve();
        });
    });
}

var firstInitPlayer = true;
function initMediaPlayer() {
    return new Promise((resolve, reject) => {
        var onMediaPlayerReady = function() {
            // router.removeListener('EVT_MEDIA_PLAYER_READY', onMediaPlayerReady);
            playerAlive = true;
            if (moduleInteraction) {
                moduleInteraction.setPlayerState(playerAlive);
            }
        };

        router.on('EVT_MEDIA_PLAYER_READY', () => {
            if (!firstInitPlayer) {
                playerAlive = false;
                if (moduleInteraction) {
                    moduleInteraction.setPlayerState(playerAlive);
                }
            }
            firstInitPlayer = false;
            onMediaPlayerReady();
            logger.info('mediaplayer is ready');
            resolve();
        });

        if (cfg.playerBin) {
            iFlyosUtil.system('killall ' + cfg.playerBin);
            router.broadcast('DO_START', [cfg.playerBin]);
        }
    });
}

function initLightMgr() {
    return new Promise((resolve, reject) => {
        var onLightReady = function() {
            router.removeListener('EVT_LIGHT_READY', onLightReady);
        };

        router.once('EVT_LIGHT_READY', () => {
            onLightReady();
            logger.info('Light is ready');
            resolve();
        });

        var params = ["register"];
        router.send("wireless", 'EVT_LIGHT_START', params);
    });
}

// 等待所有初始化操作完成，运行程序主逻辑
var initList = [initNetwork(), initSN(), initLEDCtrl(), initMediaPlayer(), initLightMgr()];
Promise.all(initList).then(() => {
    var waitTime = Number(argv[2]) || 5000;
    logger.info('system initialized');
    logger.info('wait', waitTime, " ms for system startup");
    setTimeout(() => {
        onSystemReady();
    }, waitTime);
});

setInterval(()=>{
   
}, 10000);

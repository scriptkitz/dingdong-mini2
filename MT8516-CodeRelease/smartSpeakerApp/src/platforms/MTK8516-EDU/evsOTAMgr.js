var iflyos = require('iflyos');
var EventEmitter = require('events');
var EasyCurl = require('curl');
var iFlyosUtil = require('iflyos_util');

var logger = require('logger').getLogger('OTAMgr');

var otaUrl = 'https://ota.iflyos.cn/ota/client/check/packages';
var theInstance;

/**
 * EVS ota manager implementation
 * @class
 */
class EVSOTAMgr extends EventEmitter  {
    /**
     * Create EVSNetworkMgr instance
     */
    constructor(cfg) {
        super();
        theInstance = this;
        this.status = 'idle';
        this.verInfo = null;

        this.cliendId = cfg.clientID;
        this.deviceId = cfg.deviceID;
        this.otaSecret = cfg.otaSecret;
    }

    start() {
        logger.info('start()');
        var router = iflyos.router;
        return new Promise(r => {
            router.once('DO_REPORT_OTA_CURRENT_VERSION_INFO', (version) => {
                this.version = JSON.parse(version).versionCode;
                r(this.version);
            });
            router.send('wireless', 'EVT_OTA_GET_VERSION_INFO');
        });
    }

    getStatus() {
        return this.status;
    }

    _onOTAStarted() {
        this.status = 'ongoing';
        if(!this.isAuto){
            this.emit('ota_start_tip');
        }
    }

    _onOTAFailed(code) {
        logger.info('ota failed, code:', code);
        this.status = 'idle';
        if(!this.isAuto){
            this.emit('ota_fail_tip');
        }
    }

    _onOTAProgress(total, current) {
        if (total != current && !this.isAuto) {
            this.emit('ota_update_progress', this.verInfo || {});
        }
    }

    updateIfHasNewVersion() {
        this.checkVersion().then(ver => {
            this.verInfo = ver;
            this.startUpdate(this.verInfo.url, true);
        }).catch(e => {
            logger.info('check ota version failed', e);
        });
    }

    startUpdate(url, isAuto) {
        //assume ongoing update is 'isAuto', for tips
        this.isAuto = isAuto;
        if(this.status == 'ongoing') {
            logger.info('already in update', this.status);
            return;
        }

        var router = iflyos.router;
        this.status = 'ongoing';
        router.once('DO_REPORT_OTA_START', this._onOTAStarted.bind(this));
        router.once('DO_REPORT_OTA_FAILED', this._onOTAFailed.bind(this));
        router.on('DO_REPORT_OTA_PROGRESS', this._onOTAProgress.bind(this));
        router.send('wireless', 'EVT_OTA_UPDATE', [url]);
    }

    compareVersion(v1, v2) {
        if(!v1 || !v2) return false;
        var v1n = parseInt(v1);
        var v2n = parseInt(v2);
        if(v1n > v2n) return 1;
        if(v1n < v2n) return -1;
        return 0;
        // var v1s = v1.toString().split('.').map(v=>parseInt(v));
        // var v2s = v2.toString().split('.').map(v=>parseInt(v));
        //
        // for(var i = 0; i < v1s.length && i < v2s.length; i++){
        //     if(v1s[i] > v2s[i]){
        //         return 1;
        //     }else if(v1s[i] < v2s[i]){
        //         return -1;
        //     }
        // }
        // if(v1s.length > v2s.length) {
        //     return 1;
        // }else if(v1.length < v2s.length){
        //     return -1;
        // }
        //
        // return 0;
    }

    checkVersion() {
        if(this.intervalChecker) {
            clearInterval(this.intervalChecker);
            this.intervalChecker = undefined;
        }
        this.intervalChecker = setTimeout(() => {
            this.checkVersion().then((v) => {
                this.startUpdate(v.url, true);
            });
        }, 3600 * 24 * 1000);

        return new Promise((r, j) => {
            this._getCurl().perform((err, data) => {
                if (err) {
                    logger.info('fail to request package list:', err);
                    j(err);
                } else {
                    logger.info('package list response:', data);
                    try {
                        var info = JSON.parse(data);
                        if (info.errorMessage) {
                            logger.info('fail to get package list:', info.errorMessage);
                            j(info.errorMessage);
                        } else if (info.length >= 1) {
                            // info[0].url = 'https://xiaoyan-resource.iflyos.cn/xiaoyan/version/qingchun/100007_1570669998201/info'
                            if (this.compareVersion(info[0].version_id, this.version) > 0) {
                                this.verInfo = info[0]
                                logger.info('verinfo->', this.verInfo);
                                r(info[0]);
                            } else {
                                j('empty');
                            }
                            //if (!this.recordInfo.id || this.otaInfo.id > this.recordInfo.id) {
                            //    this._downloadPackage();
                            //} else {
                            //    logger.info('no available package');
                            //}
                        } else {
                            j('empty');
                        }
                    } catch (e) {
                        logger.info('fail to parse package list', e);
                        j(e);
                    }
                }
            });
        });
    }

    _getCurl() {
        var timeVal = parseInt(Date.now() / 1000).toString();
        var randVal = (iFlyosUtil.rand() % 65535).toString();
        var shaVal = iFlyosUtil.sha(this.cliendId, this.deviceId, timeVal, randVal, this.otaSecret);

        var curl = new EasyCurl();
        curl.addHeader('X-Client-ID: ' + this.cliendId);
        curl.addHeader('X-Device-ID: ' + this.deviceId);
        curl.addHeader('X-Version-ID: ' + this.version);
        curl.addHeader('X-Timestamp: ' + timeVal);
        curl.addHeader('X-Nonce: ' + randVal);
        curl.addHeader('X-Signature: ' + shaVal);
        curl.setOpt(EasyCurl.CURLOPT_URL, otaUrl);
        curl.setOpt(EasyCurl.CURLOPT_TIMEOUT, 10);
        logger.info('X-Client-ID: ' + this.cliendId)
        logger.info('X-Device-ID: ' + this.deviceId)
        logger.info('X-Version-ID: ' + this.version)
        logger.info('X-Timestamp: ' + timeVal)
        logger.info('X-Nonce: ' + randVal)
        logger.info('X-Signature: ' + shaVal)
        return curl;
    }
}

module.exports.EVSOTAMgr = EVSOTAMgr;

function get() {
    return theInstance;
}
module.exports.get = get;
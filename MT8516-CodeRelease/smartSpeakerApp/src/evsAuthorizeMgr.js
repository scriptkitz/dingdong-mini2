var EventEmitter = require('events');
var EasyCurl = require('curl');
var Sqlite = require('sqlite');
var fs = require('fs');
var logger = require('logger').getLogger('AuthMgr');

var authUrl = 'https://auth.iflyos.cn/oauth/ivs/token/ble';
var refreshUrl = 'https://auth.iflyos.cn/oauth/ivs/token';

/**
 * EVS Authorization Manager implementation
 * @class
 */
class EVSAuthorizeMgr extends EventEmitter {
    /**
     * Create EVSAuthorizeMgr instance
     * @param {json} cfg - configurations
     */
    constructor(cfg) {
        super();

        this.dbPath = cfg.dbPath + '/auth.db';

        this.clientId = cfg.clientID;
        this.deviceId = cfg.deviceID;

        this.code = null;
        this.refreshToken = null;
        this.accessToken = null;

        this.expireTimer = null;
        this.isReset = false;
    }

    /**
     * Check authorization
     * @fires EVSAuthorizeMgr#ok
     * @fires EVSAuthorizeMgr#fail
     * @fires EVSAuthorizeMgr#status
     */
    getRefreshToken(callback) {
        if (callback) {
            fs.exists(this.dbPath, (result) => {
                if (result) {
                    var sql = 'SELECT refreshToken FROM refreshToken;';
                    new Sqlite(this.dbPath).execute(sql, (err, results) => {
                        if (err || !results) {
                            logger.error('fail to get refresh token', err);
                            callback();
                        } else {
                            callback(results[0].refreshToken);
                        }
                    });
                } else {
                    callback();
                }
            });
        }
    }

    authWithCode(code) {
        this.code = code;
        this.isReset = false;
        this._queryRefreshToken();
    }

    authWithRefreshToken(token) {
        this.isReset = false;
        this.refreshToken = token;
        this._queryAccessToken();
    }

    reset() {
        this.isReset = true;
    }

    _queryRefreshToken() {
        var authCurl = new EasyCurl();
        var escapedDeviceId = EasyCurl.escape(this.deviceId);
        var url = authUrl + '/' + this.clientId + '/' + escapedDeviceId + '/' + this.code;
        logger.debug("auth url:", url);
        authCurl.setOpt(EasyCurl.CURLOPT_URL, url);
        authCurl.setOpt(EasyCurl.CURLOPT_TIMEOUT, 10);
        authCurl.perform((err, data) => {
            if (this.isReset) {
                // 被外部终止，则立即退出
                return;
            } else if (err) {
                // 如因网络原因造成请求失败，则1S后继续尝试请求
                logger.error('query refresh token failed', err);
                setTimeout(() => {
                    this._queryRefreshToken();
                }, 1000);
            } else {
                logger.debug('refresh token data:', data);

                try {
                    var info = JSON.parse(data);
                } catch (err) {
                    // 如果json解析失败，则抛出fail事件
                    this.emit('fail', new Error('error_refresh_token_response'));
                    return;
                }

                if (info.error) {
                    // 如果json中带error字段信息，则说明授权失败
                    logger.error('query refresh token failed:', info.error, info.message);
                    this.emit('fail', new Error(info.error));
                } else {
                    // 授权成功则将refresh token保存在本地
                    this._saveRefreshToken(info);
                }
            }
        });
    }

    _saveRefreshToken(info) {
        var sql = 'begin;';
        sql += 'CREATE TABLE IF NOT EXISTS refreshToken (refreshToken TEXT);';
        sql += 'DELETE FROM refreshToken;';
        sql += 'INSERT INTO refreshToken(refreshToken) VALUES(\'' + info.refresh_token + '\');';
        sql += 'end;';
        logger.debug('save refresh token sql:', sql);

        new Sqlite(this.dbPath).execute(sql, (err) => {
            if (err) {
                logger.error('save refresh token failed:', err);
                this.emit('fail', new Error('fail_save_refresh_token'));
            } else {
                this.refreshToken = info.refresh_token;
                this._onAccessToken(info);
            }
        });
    }

    _queryAccessToken() {
        var curl = new EasyCurl();
        curl.addHeader('Expect:');
        curl.addHeader('Content-Type: application/json');
        curl.setOpt(EasyCurl.CURLOPT_URL, refreshUrl);
        curl.setOpt(EasyCurl.CURLOPT_TIMEOUT, 10);
        var postData = JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: this.refreshToken
        });
        logger.debug('access token post data:', postData);
        curl.setOpt(EasyCurl.CURLOPT_POSTFIELDSIZE, postData.length);
        curl.setOpt(EasyCurl.CURLOPT_POSTFIELDS, postData);
        curl.perform((err, data) => {
            logger.debug('query access token reuslt:', err, data);
            if (this.isReset) {
                // 被外部终止，则立即退出
                return;
            } else if (err) {
                // 如因网络原因造成请求失败，则1S后继续尝试请求
                logger.error('query access token failed', err);
                setTimeout(() => {
                    this._queryAccessToken();
                }, 1000);
            } else {
                logger.debug('access token data:', data);
                try {
                    var info = JSON.parse(data);
                } catch (err) {
                    // 如果json解析失败，则抛出fail事件
                    this.emit('fail', new Error('error_access_token_response'));
                }
                if (info.error) {
                    // 如果json中带error字段信息，则说明授权失效
                    logger.error('query access token failed:', info.error);
                    this.emit('fail', new Error(info.error));
                } else {
                    // 获取access token成功
                    this._onAccessToken(info);
                }

            }
        });
    }

    _onAccessToken(info) {
        if (this.expireTimer) {
            clearTimeout(this.expireTimer);
        }

        // 设置定时器在Access Token过期前一小时重新刷新
        var waitSec = 86400 * 10;
        if (info.expires_in > 3600 && info.expires_in < waitSec) {
            waitSec = info.expires_in - 3600;
        }

        logger.info('access token will be refreshed in', waitSec, 's');
        this.expireTimer = setTimeout(()=> {
            this.isReset = false;
            this._queryAccessToken();
        }, waitSec * 1000);

        this.accessToken = info.access_token;
        this.emit('access_token', this.accessToken);
    }
}

/**
 * ok event.
 * @event EVSAuthorizeMgr#ok
 * @type {string} access token
 */

/**
 * fail event.
 * @event EVSAuthorizeMgr#fail
 * @type {Error} error message
 */

module.exports.EVSAuthorizeMgr = EVSAuthorizeMgr;

var EventEmitter = require('events');
var getOta = require('./platforms/' + iflyosPlatform + '/evsOTAMgr').get;
var logger = require('logger').getLogger('CapSystem');

/**
 * @class
 * EVS System capability implementation
 */
class EVSCapSystem extends EventEmitter{
    /**
     * @param {EVSClient}client
     * @param {EVSContextMgr}cxtMgr
     * @fires EVSCapSystem#ping_timeout
     * @fires EVSCapSystem#time_changed
     * @fires EVSCapSystem#response_error
     * @fires EVSCapSystem#device_removed
     */
    constructor(client, cxtMgr) {
        super();
        cxtMgr.addContextProvider(this._getContext.bind(this));
        this.pingTimeout = 1000 * 60 * 10;
        this.timeoutCount = 0;
        this.client = client;
        this.pingCheckTimer = undefined;
        this.syncContextTimer = undefined;
        this.verInfo = null;
        this.client.onDirective("system.ping", this._onPing.bind(this));
        this.client.onDirective("system.error", this._onError.bind(this));
        this.client.onDirective("system.revoke_authorization", this._onRevokeAuth.bind(this));
        this.client.onDirective("system.check_software_update", this._onCheckNewVersion.bind(this));
        this.client.onDirective("system.update_software", this._onUpdateVersion.bind(this));
        this.client.onDirective("system.power_off", this._onPowerOff.bind(this));
        //this.client.onDirective("system.update_device_modes", this._onDeviceEVSMode.bind(this));
        this.client.on('connected', this._onConnected.bind(this));
        this.client.on('disconnected', this._onDisconnected.bind(this));
    }

    _getContext() {
        return {
            system:{
                version:"1.1"
            }
        };
    }

    _onCheckNewVersion() {
        var ota = getOta();
        ota.checkVersion().then(ver => {
            this.verInfo = ver;
            if (ota.getStatus() === 'ongoing') {
                this.client.request({
                    header: {
                        name: 'system.software_update_state_sync'
                    },
                    payload: {
                        state: "STARTED",
                        version_name: "" + this.verInfo.version_id,
                        update_description: this.verInfo.description
                    }
                });
            } else {
                this.client.request({
                    header: {
                        name: 'system.check_software_update_result'
                    },
                    payload: {
                        result: "SUCCEED",
                        need_update: true,
                        version_name: "" + this.verInfo.version_id,
                        update_description: this.verInfo.description,
                    }
                });
            }
        }).catch(e => {
            logger.info('check ota version failed', e);
            if (e === 'empty') {
                this.client.request({
                    header: {
                        name: 'system.check_software_update_result'
                    },
                    payload: {
                        result: "SUCCEED",
                        need_update: false
                    }
                });
            } else {
                this.client.request({
                    header: {
                        name: 'system.check_software_update_result'
                    },
                    payload: {
                        result: "FAILED"
                    }
                });
            }
            
        });
    }

    _onUpdateVersion(){
        getOta().startUpdate(this.verInfo && this.verInfo.url, false);
    }

    _onPowerOff(){
        logger.info('power off not implemented');
    }

    /**
     * store exception to server. refer to iFLYOS doc for details
     * @param {string}type
     * @param {string}code
     * @param {string}message
     */
    sendException(type, code, message){
        logger.info('client has exception:', type, code, message);
        this.client.request({
            header:{
                name: 'system.exception'
            },
            payload:{
                type: type,
                code: code,
                message: message
            }
        });
    }

    _onRevokeAuth(response){
        /**
         * device's authentication has been removed
         * @event EVSCapSystem#device_removed
         */
        this.emit('device_removed');
    }

    _onError(response){
        logger.info('response error:', response);
        /**
         * server responses a system.error
         * @event EVSCapSystem#response_error
         */
        this.emit('response_error', response);
    }

    /**
     * sync latest device context to server
     * @param [reason] why we need sync
     */
    syncContext(reason){
        logger.info('to send system.state_sync because?', reason);
        this.client.request({
            header:{
                name: "system.state_sync"
            },
            payload:{

            }
        });
        logger.info('to sync context 15 mins later');
        if(this.syncContextTimer){
            clearTimeout(this.syncContextTimer);
        }
        this.syncContextTimer = setTimeout(()=>{
            this.syncContext("15 min cycle");
        }, 15 * 60 * 1000);
    }

    _onPing(response){
        if(this.pingCheckTimer){
            clearTimeout(this.pingCheckTimer);
            this.pingCheckTimer = undefined;
        }
        logger.info('timestamp from server', response.payload.timestamp);
        var timeDiff = Date.now() - response.payload.timestamp * 1000;
        if(timeDiff > 60000 || timeDiff < -60000){
            /**
             * local time is different from server
             * @event EVSCapSystem#time_changed
             */
            logger.info('fire time_changed');
            this.emit('time_changed', response.payload.timestamp * 1000);
        }
        logger.info('reset ping timeout');
        this.timeoutCount = 0;
        this.pingCheckTimer = setTimeout(this._onPingCheckTimeout.bind(this), this.pingTimeout);
    }

    _onPingCheckTimeout(){
        /**
         * timeout receiving ping from server
         * @event EVSCapSystem#ping_timeout
         */
        
        if(this.timeoutCount >= 2) {
            this.timeoutCount = 0;
            logger.info("receiving ping timeout");
            this.pingCheckTimer = undefined;
            this.emit('ping_timeout');
            this.client.reconnect();
        } else {
            this.timeoutCount++;
            logger.info("receiving ping timeout count", this.timeoutCount);
            if(this.pingCheckTimer){
                clearTimeout(this.pingCheckTimer);
                this.pingCheckTimer = undefined;
            }
            this.pingCheckTimer = setTimeout(this._onPingCheckTimeout.bind(this), this.pingTimeout);
        }
    }

    _onConnected(){
        if(this.syncContextTimer){
            clearTimeout(this.syncContextTimer);
            this.syncContextTimer = undefined;
        }
        this.syncContextTimer = setTimeout(()=>{
            this.syncContext('client startup');
        }, 0);
        this.timeoutCount = 0;
        if(this.pingCheckTimer){
            clearTimeout(this.pingCheckTimer);
            this.pingCheckTimer = undefined;
        }
        logger.info('evs connected, start ping timeout check');
        this.pingCheckTimer = setTimeout(this._onPingCheckTimeout.bind(this), this.pingTimeout);
    }

    _onDisconnected(){
        logger.info('evs disconnected, stop ping timeout check');
        if(this.pingCheckTimer){
            clearTimeout(this.pingCheckTimer);
            this.pingCheckTimer = undefined;
        }

        logger.info('evs disconnected, stop interval context sync');
        if(this.syncContextTimer){
            clearTimeout(this.syncContextTimer);
            this.syncContextTimer = undefined;
        }
    }
}

exports.EVSCapSystem = EVSCapSystem;
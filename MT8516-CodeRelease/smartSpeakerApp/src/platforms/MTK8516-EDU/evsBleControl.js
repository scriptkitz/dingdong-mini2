var EventEmitter = require('events');
var router;

/**
 * EVS rpc ble control implementation
 * @class
 */
class EVSBleControl extends EventEmitter {
    /**
     * Create EVSBleControl instance
     * @param {string} clientId
     * @param {string} deviceId
     * @param {string} bleName
     * @param {string} serverUuid
     * @param {string} charUuid
     */
    constructor(clientId, deviceId, bleName, serverUuid, charUuid) {
        super();

        this.bleRunning = false;
        this.moduleName = "wireless";
        this.param = [clientId, deviceId, bleName, serverUuid, charUuid];
        router = require('iflyos').router;
        router.on('DO_REPORT_BLE_CFG_WIFI_STATUS', this._onStatus.bind(this));
        router.on('DO_REPORT_BLE_CFG_WIFI_DATA', this._onData.bind(this));
    }

    /**
     * Start ble advertising
     * @fires EVSBleControl#accept
     * @fires EVSBleControl#data
     * @fires EVSBleControl#disconnect
     */
    start() {
        if (this.bleRunning) {
            this.stop();
            setTimeout(this.start.bind(this), 1000);
        } else {
            router.send(this.moduleName, 'EVT_BLE_CFG_WIFI_START', this.param);
            this.bleRunning = true;
        }
    }

    stop() {
        if (this.bleRunning) {
            router.send(this.moduleName, 'EVT_BLE_CFG_WIFI_STOP');
            this.bleRunning = false;
        }
    }

    disconnect() {
        this.stop();
    }

    _onStatus(status) {
        if (status === 'new connection') {
            /**
             * New ble connection
             * @event EVSBleControl#accept
             */
            this.emit('accept');
        } else if (status === 'disconnect') {
            /**
             * disconnect from ble client
             * @event EVSBleControl#disconnect
             */
            this.emit('disconnect');
        }
    }

    _onData(ssid, password, code) {
        ssid = ssid.replace('id ', '');
        password = password.replace('pwd ', '');
        code = code.replace('code ', '');

        /**
         * receive data from ble client
         * @event EVSBleControl#data
         * @type {string} wifi ssid
         * @type {string} wifi password
         * @type {string} authorization code
         */
        this.emit('data', ssid, password, code);
    }
}

module.exports.EVSBleControl = EVSBleControl;

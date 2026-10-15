var router;

/**
 * EVS rpc wifi control implementation
 * @class
 */
class EVSWifiControl {
    /**
     * Create EVSWifiControl instance
     */
    constructor() {
        this.callback = null;
        this.moduleName = 'wireless';

        router = require('iflyos').router;
        router.on('DO_REPORT_CFG_WIFI', this._onCfgWifi.bind(this));
    }

    /**
     * Start ble advertising
     * @param {string} ssid
     * @param {string} password
     * @param {function} callback
     */
    configWifi(ssid, password, callback) {
        this.callback = callback;
        router.send(this.moduleName, 'EVT_CFG_WIFI', [ssid, password]);
    }

    _onCfgWifi(result) {
        if (this.callback) {
            this.callback(result === 'success' ? null : new Error(result));
        }
    }
}

module.exports.EVSWifiControl = EVSWifiControl;

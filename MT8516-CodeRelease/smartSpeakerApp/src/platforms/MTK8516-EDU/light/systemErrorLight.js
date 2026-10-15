var BaseLight = require('./platforms/' + iflyosPlatform + '/light/baseLight').BaseLight;
var LightType = require('../../../lightType').LightType;

class SystemErrorLight extends BaseLight {
    constructor(callback, type, ledController) {
        super(callback, type, ledController);
        this.priority = 20;
    }

    open() {
        if (this.state !== "open") {
            this.logger.info('open ', this.type);
            this.state = "open";
            this._sendMsg('1', 'NETFAILED', '');
        }
    }

    close() {
        if (this.state !== "close") {
            this.logger.info('close ', this.type);
            this.state = "close";
            this._sendMsg('0', 'NETFAILED', '');
            this.callBack(this);
        }
    }

    pause() {
        this.logger.info('pause ', this.type);
        this.state = "pause";
        this._sendMsg('0', 'NETFAILED', '');
    }

    resume() {
        this.logger.info('resume ', this.type);
        this.state = "open";
        this._sendMsg('1', 'NETFAILED', '');
    }

    reStart() {
        this.logger.info('reStart ', this.type);
    }

    needPause(light) {
        return false;
    }
}

module.exports.SystemErrorLight = SystemErrorLight;
var BaseLight = require('./platforms/' + iflyosPlatform + '/light/baseLight').BaseLight;

class NetWaitLight extends BaseLight {
    constructor(callback, type, ledController) {
        super(callback, type, ledController);
        this.priority = 20;
    }

    open() {
        super.open();
    }
 
    close() {
        super.close();
    }

    pause() {
        this.logger.info('pause ', this.type);
        this.state = "pause";
        this._sendMsg('0', this.type, '');
    }

    resume() {
        this.logger.info('resume ', this.type);
        this.state = "open";
        this._sendMsg('1', this.type, '');
    }

    reStart() {
        this.logger.info('reStart ', this.type);
    }

    needPause(light) {
        return false;
    }
}

module.exports.NetWaitLight = NetWaitLight;
var BaseLight = require('./platforms/' + iflyosPlatform + '/light/baseLight').BaseLight;

class UpdatingLight extends BaseLight {
    constructor(callback, type, ledController) {
        super(callback, type, ledController);
        this.priority = 20;
    }

    open() {
        if (this.state !== "open") {
            this.logger.info('open ', this.type);
            this.state = "open";
            this._sendMsg('1', 'NETWAIT', '');
        }
    }

    close() {
        if (this.state !== "close") {
            this.logger.info('close ', this.type);
            this.state = "close";
            this._sendMsg('0', 'NETWAIT', '');
            this.callBack(this);
        }
    }

    pause() {
        this.logger.info('pause ', this.type);
        this.state = "pause";
        this._sendMsg('0', 'NETWAIT', '');
    }

    resume() {
        this.logger.info('resume ', this.type);
        this.state = "open";
        this._sendMsg('1', 'NETWAIT', '');
    }

    reStart() {
        this.logger.info('reStart ', this.type);
    }

    needPause(light) {
        return false;
    }
}

module.exports.UpdatingLight = UpdatingLight;
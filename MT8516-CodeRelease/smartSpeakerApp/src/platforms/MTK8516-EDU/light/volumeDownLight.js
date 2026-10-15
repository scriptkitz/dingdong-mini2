var BaseLight = require('./platforms/' + iflyosPlatform + '/light/baseLight').BaseLight;

class VolumeDownLight extends BaseLight {
    constructor(callback, type, ledController) {
        super(callback, type, ledController);
        this.priority = 30;
    }

    open() {
        if (this.state !== "open") {
            this.logger.info('open ', this.type);
            this.state = "open";
            this.ledController.on('onState', this._onState.bind(this));
            var vol = this.volume.toString();
            this._sendMsg('1', this.type, vol);
        }
    }

    close() {
        if (this.state !== "close") {
            this.logger.info('close ', this.type);
            this.state = "close";
            this.ledController.removeListener('onState', this._onState.bind(this));
            var vol = this.volume.toString();
            this._sendMsg('0', this.type, vol);
            this.callBack(this);
        }
    }

    pause() {
        this.logger.info('pause ', this.type);
    }

    resume() {
        this.logger.info('resume ', this.type);
    }

    reStart() {
        this.logger.info('reStart ', this.type);
    }

    needPause(light) {
        return false;
    }

    _onState(state) {
        if (this.state !== "close") {
            this.logger.info('auto close ', this.type);
            this.state = "close";
            this.callBack(this);
        }
    }
}

module.exports.VolumeDownLight = VolumeDownLight;
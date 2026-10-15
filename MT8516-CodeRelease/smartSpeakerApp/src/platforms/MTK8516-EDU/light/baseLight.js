var logger = require('logger').getLogger('Light');

class BaseLight {
    constructor(callBack, type, ledController) {
        this.callBack = callBack;
        this.type = type;
        this.logger = logger;
        this.state = "close";
        this.ledController = ledController;
        this.ledController.on('onState', this._onState.bind(this));
        this.volume = 0;

        this.priority = 0;
    }

    open() {
        if (this.state !== "open") {
            this.logger.info('open ', this.type);
            this.state = "open";
            this._sendMsg('1', this.type, '');
        }
    }

    close() {
        if (this.state !== "close") {
            this.logger.info('close ', this.type);
            this.state = "close";
            this._sendMsg('0', this.type, '');
            this.callBack(this);
        }
    }

    setVolume(volume) {
        this.volume = volume;
    }

    setPosition(position) {
        
    }

    getType() {
        return this.type;
    }

    getPriority() {
        return this.priority;
    }

    pause() {

    }

    resume() {

    }

    reStart() {

    }

    needPause(light) {
        return false;
    }

    _sendMsg(state, type, volume) {
        this.ledController.sendMsg(state, type, volume);
    }
    
    _onState(state) {

    }


}

module.exports.BaseLight = BaseLight;
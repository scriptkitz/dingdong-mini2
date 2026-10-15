var BaseLight = require('./platforms/' + iflyosPlatform + '/light/baseLight').BaseLight;

class BootedLight extends BaseLight {
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
}

module.exports.BootedLight = BootedLight;
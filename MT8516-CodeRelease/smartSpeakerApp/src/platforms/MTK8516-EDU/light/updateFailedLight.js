var BaseLight = require('./platforms/' + iflyosPlatform + '/light/baseLight').BaseLight;

class UpdateFailedLight extends BaseLight {
    constructor(callback, type, ledController) {
        super(callback, type, ledController);
        this.lightTimeout = undefined;
        this.priority = 20;
    }

    open() {
        if (this.state !== "open") {
            if(this.lightTimeout) {
                clearTimeout(this.lightTimeout);
                this.lightTimeout = undefined;
            }
            this.logger.info('open ', this.type);
            this.state = "open";
            this._sendMsg('1', 'NETFAILED', '');
            this.lightTimeout = setTimeout(()=>
                {
                    this.close();
                }
            , 5 * 1000);
        }
    }

    close() {
        if (this.state !== "close") {
            if(this.lightTimeout) {
                clearTimeout(this.lightTimeout);
                this.lightTimeout = undefined;
            }
            this.logger.info('close ', this.type);
            this.state = "close";
            this._sendMsg('0', 'NETFAILED', '');
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
}

module.exports.UpdateFailedLight = UpdateFailedLight;
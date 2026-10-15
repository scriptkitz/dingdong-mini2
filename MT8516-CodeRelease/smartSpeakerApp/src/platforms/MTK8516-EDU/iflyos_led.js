var logger = require('logger').getLogger('LEDControl');

class LEDControl  {
    constructor(cb) {
        setTimeout(cb, 100);
    }
    /**
     * powering on
     */
    startup(){
        logger.info('start up');
        return Promise.resolve();
    }

    /**
     * power on finish
     */
    startupDone(){
        logger.info('start up done');
        return Promise.resolve();
    }

    /**
     * pop to stable LED status
     */
    back2Idle(){
        logger.info('back to idle');
        this.onIdle && this.onIdle();
    }

    _noInternet(){
        return Promise.resolve();
    }

    /**
     * stable status become 'no internet connection'
     */
    noInternet(){
        logger.info('noInternet()');
        this.onIdle = this._noInternet.bind(this);
        this._noInternet();
    }

    _normal(){
        return Promise.resolve();
    }

    /**
     * stable status become 'normal', meaning can wake up for voice recognition
     */
    normal(){
        logger.info('normal()');
        this.onIdle = this._normal.bind(this);
        return this._normal();
    }

    /**
     * temporary status 'wakeup'
     * @param angle 0~360
     */
    wakeup(angle){
        this.angle = angle % 360;
        logger.info('wakeup', angle);
        return Promise.resolve();
    }

    /**
     * temporary status 'thinking'
     * @param angle 0~360, or the angle in last wake up
     */
    thinking(angle){
        if(angle == undefined) {
            angle = this.angle;
        }
        logger.info('thinking', angle);
        return Promise.resolve();
    }

    /**
     * evs speaking tts
     */
    speaking(){
        logger.info('speaking');
        return Promise.resolve();
    }

    /**
     * evs listening for recognize
     */
    listening(angle){
        if(angle == undefined) {
            angle = this.angle;
        }
        logger.info('listening', angle);
        return Promise.resolve();
    }

    alert(){
        logger.info('alart');
        return Promise.resolve();
    }

    configNet(){
        logger.info('config net');
        return Promise.resolve();
    }
}

module.exports.LEDControl = LEDControl;
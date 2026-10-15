var EventEmitter = require('events');
var router;

class LedController extends EventEmitter{
    constructor() {
        super();
        router = require('iflyos').router;
        router.on('DO_REPORT_LIGHT_STATE', this._onState.bind(this));
    }

    sendMsg(state, type, volume) {
        var params = [state, type, volume];
        router.send("wireless", 'EVT_LIGHT_CONTROLLER', params);
    }
    
    _onState(state) {
        this.emit('onState', state);
    }

}

module.exports.LedController = LedController;
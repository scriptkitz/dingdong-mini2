var EventEmitter = require('events').EventEmitter;

class iFLYTEKUart extends EventEmitter{
    constructor() {
        super();
    }
    
    init(device, rate) {
        native.init.bind(this)(device, rate);
    }

    send(msg) {
        native.send.bind(this)(msg);
    }
    
    uninit() {
        native.uninit.bind(this)();
    }

    _nativeRecv_Callback(msg) {
        this.emit("recv", msg);
    }

}

function getUart() {
    return new iFLYTEKUart();
}


exports.iflyos_uart = iFLYTEKUart;
module.exports.getUart = getUart;
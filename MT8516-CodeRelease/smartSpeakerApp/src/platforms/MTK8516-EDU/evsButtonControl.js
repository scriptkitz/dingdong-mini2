var EventEmitter = require('events');
var fs = require('fs');
var getOta = require('./evsOTAMgr').get;
var logger = require('logger').getLogger('BleControl');

var CODES = {
    114 : 'PLAY_PAUSE',
    115 : 'POWER',
    248 : 'VOL_MUTE',
    113 : 'VOL_UP',
    116 : 'VOL_DOWN'
};

var LONG_CODES = {
    115 : 'NET_CFG',
    113 : 'RESTORE',
};

var COMB_LONG_CODES = {
    116 : 'DEV_MODE',
};

/**
 * @class
 * Button control implementation
 */
class EVSButtonControl extends EventEmitter {
    constructor() {
        super();

        fs.open('/dev/input/event2', 'r', (err, fd) => {
            if (err) {
                logger.error('fail to open file /dev/input/event2', err);
            } else {
                this._inspect(fd);
            }
        });

        fs.open('/dev/input/event3', 'r', (err, fd) => {
            if (err) {
                logger.error('fail to open file /dev/input/event3', err);
            } else {
                this._inspect(fd);
            }
        });

        this.pressTimer = undefined;
        this.lastUpTime = undefined;
        this.longPressed = 0;
        this.pressedTimes = 0;
    }

    _inspect(fd) {
        var eventData = new Buffer(24);
        fs.read(fd, eventData, 0, 24, -1, (err, bytesRead, buffer) => {
            if (err) {
                logger.error('fail to read file /dev/input/eventX', err)
            } else {
                var base = 16;
                var type = buffer.readUInt16LE(base);
                var code = buffer.readUInt16LE(base + 2);
                var value = buffer.readUInt16LE(base + 4);//signed 32, but only 0 1 so uint16 do same
                logger.debug('type', type, 'code', code, 'value', value);
                if (type === 1) {
                    if (value === 1) {
                        var otaMgr = getOta();
                        if (otaMgr && otaMgr.getStatus() != 'idle') {
                            this.emit('PLAY_OTA_TIP');
                        } else {
                            this._onButtonDown(code);
                        }
                    } else if (value === 0) {
                        this._onButtonUp(code);
                    }
                }
            }
            this._inspect(fd);
        });
    }

    _onButtonDown(code) {
        this.pressTimer = setTimeout(()=>{
            this._onLongPress(code);
        }, 5000);
    }

    _onButtonUp(code) {
        var upTime = Date.now();
        if (this.pressTimer) {
            clearTimeout(this.pressTimer);
            this.pressTimer = undefined;

            if (this.lastUpTime && Date.now() - this.lastUpTime < 300) {
                this.pressedTimes += 1;
            } else {
                this.pressedTimes = 1;
            }

            if (this.pressedTimes === 7) {
                //this.emit('fastpress');
            } else if (this.pressedTimes === 1) {
                //console.log('emit', CODES[code]);
                this.emit(CODES[code]);
                this.longPressed = 0;
            }
        }
        this.lastUpTime = upTime;
    }

    _onLongPress(code) {
        //console.log('long pressed:', code, 'current:', this.longPressed);
        this.pressTimer = undefined;
        if(this.longPressed > 0){
            this.longPressed += code;
            if(COMB_LONG_CODES[code]){
                //console.log('emit',COMB_LONG_CODES[this.longPressed]);
                this.emit(COMB_LONG_CODES[code]);
                this.longPressed = 0;
                return;
            }
        }
        if(LONG_CODES[code]){
            //console.log('emit', LONG_CODES[code]);
            this.emit(LONG_CODES[code]);
            this.longPressed = 0;
        } else {
            this.longPressed += code;
        }

    }
}

module.exports.EVSButtonControl = EVSButtonControl;

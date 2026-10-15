var util = require('util');

class IflyosLog {
    constructor(tag) {
        this.tag = util.isString(tag) ? '[' + tag + '] ' : '[] ';
    }

    fatal() {
        native.fatal(this.tag + util.format.apply(this, arguments));
    }

    error() {
        native.error(this.tag + util.format.apply(this, arguments));
    }

    warn() {
        native.warn(this.tag + util.format.apply(this, arguments));
    }

    info() {
        native.info(this.tag + util.format.apply(this, arguments));
    }

    debug() {
        native.debug(this.tag + util.format.apply(this, arguments));
    }

    trace() {
        native.trace(this.tag + util.format.apply(this, arguments));
    }
}

function getLogger(tag) {
    return new IflyosLog(tag);
}

function setLogLevel(level) {
    native.setLogLevel(level);
}

function enableMilliSecond(enable) {
    native.enableMilliSecond(enable);
}

function setFileMaxNum(maxNum) {
    native.setFileMaxNum(maxNum);
}

function setFileMaxKb(maxKb) {
    native.setFileMaxKb(maxKb)
}

module.exports.getLogger = getLogger;
module.exports.setLogLevel = setLogLevel;
module.exports.enableMilliSecond = enableMilliSecond;
module.exports.setFileMaxNum = setFileMaxNum;
module.exports.setFileMaxKb = setFileMaxKb;
module.exports.LOG_FATAL = 0;
module.exports.LOG_ERROR = 1;
module.exports.LOG_WARNING = 2;
module.exports.LOG_INFO = 3;
module.exports.LOG_DEBUG = 4;
module.exports.LOG_TRACE = 5;

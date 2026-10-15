var EventEmitter = require('events');

class DollMgr extends EventEmitter{
    /**
     *
     * @param {EvsClient}client because token may change, we need client not token here
     */
    constructor(client) {
        super();
        this.client = client;

    }

    start() {
        this.emit('init', 'not_present');
    }
}

module.exports.DollMgr = DollMgr;
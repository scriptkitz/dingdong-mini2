var iFlyosUtil = require('iflyos_util');
var fs = require('fs');
var logger = require('logger').getLogger('Adb');

function temporaryEnable(){
    fs.writeFile('/tmp/enable-adb','dummy', (err)=>{
        logger.error('temporaryEnable. err?', err);
        iFlyosUtil.system('/etc/init.d/S89usbgadget start');
    })
}

function persistEnable(){
    fs.writeFile('/data/enable-adb','dummy', (err)=>{
        logger.error('persistEnable. err?', err);
    })
}

module.exports.temporaryEnable = temporaryEnable;
module.exports.persistEnable = persistEnable;

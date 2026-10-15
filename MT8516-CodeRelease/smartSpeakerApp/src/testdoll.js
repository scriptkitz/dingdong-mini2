var LOG = require('logger');
LOG.setLogLevel(LOG.LOG_DEBUG);
var logger = require('logger').getLogger('main');

logger.info('it', 'is', 'info');
logger.warn('it', 'is', 'warning');
logger.error('it', 'is', 'error');
logger.fatal('it', 'is', 'fatal');
logger.debug('it', 'is', 'debug');
logger.trace('it', 'is', 'trace');

setInterval(()=>{}, 1000);

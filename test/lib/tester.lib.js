/*
 * @fileOverview Main testing helper lib.
 */

var tester = module.exports = {};

/** @const {string} expose the sqs url for testing */
tester.SQS_URL = 'https://sqs.us-east-1.amazonaws.com/409236574440/test-node-sqs-library';

/** @type {Object} simple logger */
tester.log = {
  info: function() {
    let args = Array.prototype.splice.call(arguments, 0);
    console.log('INFO:', args.join(' '));
  },
  warn: function() {
    let args = Array.prototype.splice.call(arguments, 0);
    console.log('WARN:', args.join(' '));
  },
  error: function() {
    let args = Array.prototype.splice.call(arguments, 0);
    console.log('ERROR:', args.join(' '));
  },
};

/**
 * Have a Cooldown period between tests.
 *
 * @param {number} seconds cooldown in seconds.
 * @return {Function} use is beforeEach().
 */
tester.cooldown = function(seconds) {
  return function(done) {
    setTimeout(done, seconds);
  };
};

/*
 * Awesome Lib
 * An awesome description
 * https://github.com/waldo/waldo-node-awesome-lib
 *
 * Copyright © Waldo, Inc.
 * All rights reserved.
 */

/**
 * @fileOverview bootstrap and master exporing module.
 */

const Sqs = require('./sqs');

/**
 * The main entry point, provides a normalized API for
 * getting a new sqs instance.
 *
 * @param {Object} opts Configuration options:
 *   @param {string} sqsUrl The sqs url to access.
 *   @param {number} concurrentOpsLimit Concurrent operations to run.
 *   @param {Object} logger An object containing the methods: info, warn, error.
 * @return {Sqs} A new sqs instance.
 */
module.exports = function(opts) {
  if (!opts) {
    throw new TypeError('Options are required.');
  }

  if (typeof opts.sqsUrl !== 'string') {
    throw new TypeError('"sqsUrl" option required.');
  }

  if (typeof opts.concurrentOpsLimit !== 'number') {
    throw new TypeError('"concurrentOpsLimit" option required and must be a number.');
  }

  if (!opts.logger || !opts.logger.error || !opts.logger.warn || !opts.logger.info ) {
    throw new TypeError('Not a proper logger object was passed.');
  }

  const sqs = new Sqs(opts);

  return sqs;
};

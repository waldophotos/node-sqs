/**
 * @fileOverview Queueing service using AWS SQS.
 */
const url = require('url');

const Promise = require('bluebird');
const AWS = require('aws-sdk');

/**
 * The SQS Service.
 *
 * @param {Object} opts Configuration options:
 *   @param {string} sqsUrl The sqs url to access.
 *   @param {number} concurrentOpsLimit Concurrent operations to run.
 *   @param {Object} logger An object containing the methods: info, warn, error.
 * @constructor.
 */
const Sqs = module.exports = function(opts) {
  /** @type {?AWS.SQS} SQS Instance */
  this.sqs = null;

  /** @type {number} Set an internal heartbeat to wake up fetcher if it sleeps */
  this._heartbeatTime = 10000;

  /** @type {?Object} setInterval index */
  this._heartbeatInterval = null;

  /** @type {Object} An object containing the methods: info, warn, error. */
  this.log = opts.logger;

  /** @type {?Function} The job processor to invoke */
  this._method = null;

  /** @type {number} The limit of concurrent ops */
  this.concurrentOpsLimit = opts.concurrentOpsLimit;

  let polsRequired = 1;
  if (this.concurrentOpsLimit > 10) {
    if (this.concurrentOpsLimit % 10 !== 0) {
      const errMessage = 'You can only define multiples of 10 beyond 10' +
        ' concurrent operations limit';
      throw new Error (errMessage);
    }

    polsRequired = this.concurrentOpsLimit / 10;
  }


  /** @type {number} The amount of ops running */
  this._longPollsRequired = polsRequired;

  /** @type {number} The amount of long-poll requests running */
  this._longPollsInFlight = 0;

  /** @type {string} The SQS queue URL */
  this.url = opts.sqsUrl;

  let parsedUrl = url.parse(opts.sqsUrl);
  /** @type {string} The SQS pathname */
  this.pathname = parsedUrl.pathname;

  /** @type {boolean} If this instance is disposed */
  this._isDisposed = false;
};

/**
 * Initialize Queue Service, connects to AWS SQS.
 *
 * @return {Promise} A Promise.
 */
Sqs.prototype.init = Promise.method(function () {
  this.log.info('service.sqs.connect() :: Connecting to SQS... SQS URL:', this.url);

  var sqsConf = {
    apiVersion: '2012-11-05',
    region: 'us-east-1',
  };

  this.sqs = new AWS.SQS(sqsConf);

  // promisify methods to be used
  this.getQueueAttributes = Promise.promisify(this.sqs.getQueueAttributes.bind(this.sqs));
  this.receiveMessage = Promise.promisify(this.sqs.receiveMessage.bind(this.sqs));
  this.deleteMessage = Promise.promisify(this.sqs.deleteMessage.bind(this.sqs));
  this.sendMessage = Promise.promisify(this.sqs.sendMessage.bind(this.sqs));
  this.purgeQueue = Promise.promisify(this.sqs.purgeQueue.bind(this.sqs));

  var queueConf = {
    QueueUrl: this.url,
    AttributeNames: ['ApproximateNumberOfMessages'],
  };

  return this.getQueueAttributes(queueConf)
    .bind(this)
    .then(function (res) {
      this.log.info('service.sqs.init() :: Connected to Queue:', this.pathname,
        ' Total jobs:', res.Attributes.ApproximateNumberOfMessages);
    })
    .catch(function (err) {
      this.log.warn('init() :: Queue:', this.pathname, ' Init error:', err);
      throw err;
    });
});

  /**
   * Create an SQS job.
   *
   * @param {Object} data The data to pass to the job.
   * @return {Promise} A Promise.
   */
Sqs.prototype.createJob = Promise.method(function (data) {
  if (this._isDisposed) {
    throw new Error('Instance is disposed');
  }
  this.log.info('service.sqs.createJob() :: Creating job for queue:', this.pathname);

  var dataJson = JSON.stringify(data);
  var params = {
    MessageBody: dataJson,
    QueueUrl: this.url,
    DelaySeconds: 0,
  };

  return this.sendMessage(params);
});

/**
 * Start the Job Fetching operation, will init queue fetching.
 *
 * @param {Function} method The job method.
 */
Sqs.prototype.startFetch = function (method) {

  this._method = method;

  this._mainLoop();

  // create a heartbeat to avoid loosing the long-poll
  this._heartbeatInterval = setInterval(this._mainLoop.bind(this),
    this._heartbeatTime);
};

/**
 * The mail loop that fetches the jobs.
 *
 * @private
 */
Sqs.prototype._mainLoop = function () {
  const invokeLongPolls = this._longPollsRequired - this._longPollsInFlight;

  if (invokeLongPolls <= 0) {
    return;
  }

  Promise.resolve(new Array(invokeLongPolls))
    .bind(this)
    .map(this._receiveMessages)
    .catch(function(err) {
      if (this._isDisposed) {
        return;
      }
      this.log.error('service.sqs._mainLoop() :: Error on receiveMessage for queue:',
        this.pathname, 'Error:', err.message);
    })
    .finally(this._mainLoop);
};

/**
 * The actual job fetching operation.
 *
 * @return {Promise}
 * @private
 */
Sqs.prototype._receiveMessages = Promise.method(function () {
  this._longPollsInFlight++;
  let maxMessages = 10;
  if (this.concurrentOpsLimit < 10) {
    maxMessages = this.concurrentOpsLimit;
  }
  var params = {
    QueueUrl: this.url,
    MaxNumberOfMessages: maxMessages,
    WaitTimeSeconds: 10
  };

  return this.receiveMessage(params)
    .bind(this)
    .then(this._processMessages)
    .map(this._invokeMethod)
    .catch(function (err) {
      if (this._isDisposed) {
        return;
      }

      if (err.ownError) {
        return;
      }
      this.log.error('service.sqs._receiveMessages() :: Error on receiveMessage',
        'for queue:', this.pathname, 'Error:', err.message);

      if (!err.noStack) {
        this.log.info('service.sqs._receiveMessages() :: Error stack:', err.stack);
      }
    })
    .finally(function() {
      this._longPollsInFlight--;
    });
});

/**
 * Process raw SQS messages before delivering.
 *
 */
Sqs.prototype._processMessages = function (messagesRaw) {
  let err;
  if (this._isDisposed) {
    err = new Error('Instance Disposed');
    err.ownError = true;
    throw err;
  }
  if (!Array.isArray(messagesRaw.Messages)) {
    // no jobs found, rewind...
    err = new Error('no messages');
    err.ownError = true;
    throw err;
  }

  var totalJobs = messagesRaw.Messages.length;

  this.log.info('service.sqs._receiveMessages() :: Fetched', totalJobs, ' jobs to',
    ' process for queue:', this.pathname);

  return messagesRaw.Messages;
};

/**
 * Invoke the job method.
 *
 * @param {Object} jobItem A single SQS job item.
 * @return {Promise} A promise.
 * @private
 */
Sqs.prototype._invokeMethod = Promise.method(function (jobItem) {
  var data;
  try {
    data = JSON.parse(jobItem.Body);
  } catch(ex) {
    this.log.warn('service.sqs._invokeMethod() :: Failed to JSON parse jobItem',
      'for queue:', this.pathname, 'jobItem:', jobItem);
    return;
  }

  return Promise.resolve(this._method(data))
    .bind(this)
    .then(function () {
      // job completed successfully...
      return this._completeJob(jobItem.ReceiptHandle);
    });
});

/**
 * Delete a job once its successfully finished.
 *
 * @param {string} receiptHandle The id with which to delete the job.
 * @private
 */
Sqs.prototype._completeJob = Promise.method(function (receiptHandle) {
  var params = {
    QueueUrl: this.url,
    ReceiptHandle: receiptHandle,
  };
  return this.deleteMessage(params)
    .bind(this)
    .catch(function (err) {
      this.log.error('service.sqs._completeJob() :: Deleting job failed. Error:',
        err);
    });
});

/**
 * Delete all items of the queue.
 *
 * @return {Promise} A Promise.
 */
Sqs.prototype.purge = Promise.method(function () {
  if (!this.url.match(/test/)) {
    throw new Error('SQS url does not include "test", will not purge.');
  }

  this.log.info('service.sqs.purge() :: Purging queue with url:', this.url);
  var params = {
    QueueUrl: this.url,
  };
  return this.purgeQueue(params)
    .bind(this)
    .catch(function (err) {
      this.log.warn('service.sqs.purge() :: Purging queue error:', err.message);
    });
});

/**
 * Expose a dispose method, destroy the instance.
 *
 * @return {Promise}
 */
Sqs.prototype.dispose = Promise.method(function () {
  if (this._isDisposed) {
    return;
  }
  this._isDisposed = true;

  this.startFetch = this._processMessages = this._invokeMethod = function() {
    return Promise.resolve();
  };

  this._mainLoop = function() {};

  clearInterval(this._heartbeatInterval);
  this._heartbeatInterval = null;

  this.sqs = null;
  this.log = null;
  this.concurrentOpsLimit = null;
  this.url = null;
  this._method = null;
  this.pathname = null;
});

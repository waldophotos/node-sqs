/**
 * @fileOverview Queueing service using AWS SQS.
 */
const url = require('url');

const Promise = require('bluebird');
const AWS = require('aws-sdk');

const log = require('../logger');

/**
 * The SQS Service.
 *
 * @constructor.
 */
const Sqs = module.exports = function(sqsUrl, concurrentOpsLimit) {
  /** @type {?AWS.SQS} SQS Instance */
  this.sqs = null;

  /** @type {number} The amount of ops running */
  this.concurrentOps = 0;

  /** @type {number} The limit of concurrent ops */
  this.concurrentOpsLimit = concurrentOpsLimit;

  /** @type {boolean} Boolean value for getMessage op active */
  this.queueGetRun = false;

  /** @type {string} The SQS queue URL */
  this.url = sqsUrl;

  let parsedUrl = url.parse(sqsUrl);
  /** @type {string} The SQS pathname */
  this.pathname = parsedUrl.pathname;
};

/**
 * Initialize Queue Service, connects to AWS SQS.
 *
 * @return {Promise} A Promise.
 */
Sqs.prototype.init = Promise.method(function () {
  log.info('service.sqs.connect() :: Connecting to SQS... SQS URL:', this.url);

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
      log.info('service.sqs.init() :: Connected to Queue:', this.pathname,
        ' Total jobs:', res.Attributes.ApproximateNumberOfMessages);
    })
    .catch(function (err) {
      log.warn('init() :: Queue:', this.pathname, ' Init error:', err);
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
  log.info('service.sqs.createJob() :: Creating job for queue:', this.pathname);

  var dataJson = JSON.stringify(data);
  var params = {
    MessageBody: dataJson,
    QueueUrl: this.url,
    DelaySeconds: 0,
  };

  return this.sendMessage(params);
});

/**
 * Start the Job Fetching operation, will init queue and check if op already
 * running.
 *
 * @param {Function} method The job method.
 */
Sqs.prototype.startFetch = function (method) {
  // Check if receiveMessages already running
  if (this.queueGetRun) {
    return;
  }

  // Check if max concurent ops reached and pause.
  if (this.concurrentOps > this.concurrentOpsLimit) {
    return;
  }
  this.receiveMessages(method);
};

/**
 * The actual job fetching operation.
 *
 * @param {Function} method The job method.
 */
Sqs.prototype.receiveMessages = function (method) {
  this.queueGetRun = true;

  var params = {
    QueueUrl: this.url,
    MaxNumberOfMessages: 10,
    WaitTimeSeconds: 10
  };

  this.receiveMessage(params)
    .bind(this)
    .then(this._processMessages)
    .map(function (jobMessage) {
      return this._invokeMethod(jobMessage, method);
    })
    .catch(function (err) {
      if (err.ownError) {
        return;
      }

      log.error('service.sqs.startFetch() :: Error on receiveMessage for queue:',
        this.pathname, 'Error:', err.message);

      if (!err.noStack) {
        log.info('service.sqs.startFetch() :: Error stack:', err.stack);
      }
    })
    .finally(function () {
      this.queueGetRun = false;
      this.startFetch(method);
    });
};

/**
 * Process raw SQS messages before delivering.
 *
 */
Sqs.prototype._processMessages = function (messagesRaw) {
  if (!Array.isArray(messagesRaw.Messages)) {
    // no jobs found, rewind...
    var err = new Error('no messages');
    err.ownError = true;
    throw err;
  }

  // Add to the number of concurrent ops currently running...
  var totalJobs = messagesRaw.Messages.length;
  this.concurrentOps += totalJobs;

  log.info('service.sqs.receiveMessages() :: Fetched', totalJobs, ' jobs to',
    ' process for queue:', this.pathname);

  return messagesRaw.Messages;
};

/**
 * Invoke the job method.
 *
 * @param {Object} jobItem A single SQS job item.
 * @param {Function} method The job method.
 * @return {Promise} A promise.
 * @private
 */
Sqs.prototype._invokeMethod = function (jobItem, method) {
  var data;
  try {
    data = JSON.parse(jobItem.Body);
  } catch(ex) {
    log.warn('_invokeMethod() :: Failed to JSON parse jobItem for queue:',
      this.pathname, 'jobItem:', jobItem);
    this.concurrentOps--;
    return;
  }

  return method(data)
    .bind(this)
    .then(function () {
      // job completed successfully...
      return this.completeJob(jobItem.ReceiptHandle);
    })
    .catch(function (err) {
      log.error('service.sqs._invokeMethod() :: Job failed for queue:',
        this.pathname, 'Error:', err);
    })
    .finally(function () {
      this.concurrentOps--;
    });
};

/**
 * Delete a job once its successfully finished.
 *
 * @param {string} receiptHandle The id with which to delete the job.
 */
Sqs.prototype.completeJob = function (receiptHandle) {
  var params = {
    QueueUrl: this.url,
    ReceiptHandle: receiptHandle,
  };
  return this.deleteMessage(params)
    .bind(this)
    .catch(function (err) {
      log.error('completeJob() :: Deleting job failed. Error:', err);
    });
};

/**
 * Delete all items of the queue.
 *
 */
Sqs.prototype.purge = function () {
  log.info('purge() :: Purging queue with url:', this.url);
  var params = {
    QueueUrl: this.url,
  };
  return this.purgeQueue(params)
    .bind(this)
    .catch(function (err) {
      log.warn('purge() :: Purging queue error:', err);
    });
};

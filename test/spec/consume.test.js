/**
 * @fileOverview Base API Surface tests.
 */
const chai = require('chai');
const expect = chai.expect;

const testLib = require('../lib/tester.lib');

const sqsLib = require('../..');

describe('Job Consume', function() {
  beforeEach(function() {
    const opts = {
      sqsUrl: testLib.SQS_URL,
      concurrentOpsLimit: 1,
      logger: testLib.log,
    };

    this.sqs = sqsLib(opts);
  });

  beforeEach(function() {
    return this.sqs.init();
  });

  beforeEach(function() {
    return this.sqs.purge();
  });


  it('Should get a message', function(done) {
    const data = {
      a: 1,
    };
    this.sqs.startFetch(function(jobItem) {
      expect(jobItem).to.deep.equal(data);
      done();
    });
    this.sqs.createJob(data);
  });

});

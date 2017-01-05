/**
 * @fileOverview Base API Surface tests.
 */
const chai = require('chai');
const expect = chai.expect;

const testLib = require('../lib/tester.lib');

const sqsLib = require('../..');

describe('Base API Surface', function() {
  it('should expose expected methods', function() {
    expect(sqsLib).to.be.a('function');
  });
  it('should throw when no sqsUrl defined', function() {
    expect(sqsLib).to.throw(TypeError, 'Options are required.');
  });
  it('should throw when no sqsUrl defined', function() {
    const fn = sqsLib.bind(null, {});
    expect(fn).to.throw(TypeError, '"sqsUrl" option required.');
  });
  it('should throw when no sqsUrl defined', function() {
    const fn = sqsLib.bind(null, {
      sqsUrl: testLib.SQS_URL,
    });
    expect(fn).to.throw(TypeError, '"concurrentOpsLimit" option required and must be a number.');
  });
  it('should throw when no sqsUrl defined', function() {
    const fn = sqsLib.bind(null, {
      sqsUrl: testLib.SQS_URL,
      concurrentOpsLimit: 1,
    });
    expect(fn).to.throw(TypeError, 'Not a proper logger object was passed.');
  });
  it('Instance should have expected methods', function() {
    const opts = {
      sqsUrl: testLib.SQS_URL,
      concurrentOpsLimit: 1,
      logger: testLib.log,
    };

    const sqs = sqsLib(opts);
    expect(sqs.init).to.be.a('function');
    expect(sqs.createJob).to.be.a('function');
    expect(sqs.startFetch).to.be.a('function');
    expect(sqs.purge).to.be.a('function');
  });

});

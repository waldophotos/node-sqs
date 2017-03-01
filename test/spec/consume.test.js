/**
 * @fileOverview Base API Surface tests.
 */
const chai = require('chai');
const expect = chai.expect;

const testLib = require('../lib/tester.lib');

const sqsLib = require('../..');

describe('Job Consume', function() {

  describe('Single job consumption', function() {
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

    afterEach(function() {
      return this.sqs.dispose();
    });


    it('Should get a message', function(done) {
      const data = {
        a: 1,
      };
      this.sqs.startFetch(function(jobItem) {
        return new Promise(function(resolve) {
          console.log('message test 1');
          expect(jobItem).to.deep.equal(data);
          resolve();
          done();
        }).catch(done);
      });
      this.sqs.createJob(data);
    });
    it('Should get one message at a time', function(done) {
      const data = {
        a: 1,
      };

      var counter = 0;
      var inProcess = false;
      this.sqs.startFetch(function(jobItem) {
        return new Promise(function(resolve) {
          counter++;
          expect(inProcess).to.be.false;
          inProcess = true;
          expect(jobItem).to.deep.equal(data);
          setTimeout(function() {
            inProcess = false;
            resolve();
          }, 500);
        })
          .then(function() {
            if (counter === 4) {
              done();
            }
          })
          .catch(done);
      });

      this.sqs.createJob(data);
      this.sqs.createJob(data);
      this.sqs.createJob(data);
      this.sqs.createJob(data);
    });
  });
});

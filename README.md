# SQS Library for Node

> An AWS SQS wrapper providing high level helper methods.

[![CircleCI](https://circleci.com/gh/waldophotos/node-sqs.svg?style=svg&circle-token=24885db15bd6856780089697a448d12ec09a2250)](https://circleci.com/gh/waldophotos/node-sqs)

## Install

Install the module using NPM:

```
npm install @waldo/sqs --save
```

## Documentation

The sqs library requires node 6+.

### Getting an sqs instance

The library you require is a function that accepts the following options when invoked:

```js
const sqsLib = require('@waldo/sqs');

const sqs = sqsLib({
    sqsUrl: '...',
    concurrentOpsLimit: 10,
    logger: logger,
});
```

* `sqsUrl` **String Required** The SQS url.
* `concurrentOpsLimit` **Number Required** Number of concurrent processing of incoming jobs.
* `logger` **Object Required** An object containing the methods: info, warn, error.

### Creating SQS Jobs

```js
const sqsLib = require('@waldo/sqs');

const sqs = sqsLib({
    sqsUrl: '...',
    concurrentOpsLimit: 10,
    logger: logger,
});

sqs.createJob({
    a: 1,
})
    .then(function() {
        console.log('job created!');
    })
    .catch(function(err) {
        console.error('Error creating job');
    });
```

### Consuming SQS Jobs

Job consumption expects a handler that returns a Promise. You return a Promise, the library awaits until you are finished. Once you are done, resolve or reject the promise.

If the job resolves (or returns any other value than a promise) then AWS SQS is notified that the job has been complete.

If the job rejects (or throws) then AWS SQS will not be notified and the job will come back for processing as per the queue rules.

```js
const sqsLib = require('@waldo/sqs');

const sqs = sqsLib({
    sqsUrl: '...',
    concurrentOpsLimit: 10,
    logger: logger,
});

sqs.startFetch(function(jobItem) {
    return new Promise(function(resolve, reject) {
        my_async_job()
            .then(resolve)
            .catch(reject);

    });
});
```

### Purging Jobs

For testing purposes you are allowed to perform the purge operation. To be able to perform the purge it is required to include `test` within the SQS's url.

```js
const sqsLib = require('@waldo/sqs');

const sqs = sqsLib({
    sqsUrl: '...',
    logger: logger,
});

sqs.purge()
    .then(function() {
        console.log('Queue Purged');
    });
```

## Releasing

1. Update the changelog bellow.
1. Ensure you are on master.
1. Type: `grunt release`
* `grunt release:minor` for minor number jump.
    * `grunt release:major` for major number jump.

## Release History

- **v0.0.2**, *10 Jan 2017*
    - Exposed `purge()` method and added protection to only purge test queues.
- **v0.0.1**, *05 Jan 2017*
    - Big Bang

## License

Copyright Waldo, Inc. All rights reserved.

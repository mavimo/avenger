'use strict';

const t = require('tcomb');
const Query = require('../src/Query');
const assert = require('better-assert');
const m = require('./models');

const worklistQuery = new Query({
  paramsType: t.struct({
    worklistId: t.Str
  }),
  fetchResultType: t.struct({
    worklist: m.Worklist
  }),
  fetch: (params) => () => ({
    worklist: module.exports.API.fetchWorklist(params.worklistId)
  })
});
assert(Query.is(worklistQuery));

const worklistSamplesQuery = new Query({
  paramsType: t.Nil,
  dependencies: [
    {
      query: worklistQuery,
      fetchParams: (wlq) => ({
        worklistId: wlq.worklist._id
      })
    }
  ],
  fetchResultType: t.struct({
    samples: t.list(m.Sample)
  }),
  fetch: () => (wlq) => ({
    samples: module.exports.API.fetchSamples(wlq.worklistId)
  })
});

const sampleQuery = new Query({
  paramsType: t.struct({
    sampleId: t.Str
  }),
  fetchResultType: t.struct({
    sample: m.Sample
  }),
  fetch: (params) => () => ({
    sample: module.exports.API.fetchSample(params.sampleId)
  })
});

const sampleTestsQuery = new Query({
  paramsType: t.Nil,
  dependencies: [
    {
      query: sampleQuery,
      fetchParams: (sq) => ({
        sampleId: sq.sample._id
      })
    }
  ],
  fetchResultType: t.struct({
    tests: t.list(m.Test)
  }),
  fetch: () => (sq) => ({
    tests: module.exports.API.fetchTests(sq.sampleId)
  })
});

const sampleTestsKindQuery = new Query({
  paramsType: t.Nil,
  dependencies: [
    {
      query: sampleTestsQuery,
      fetchParams: (stq) => ({
        testKindId: stq.tests.map((test) => test._testKindId)
      }),
      multi: 'testKindId'
    }
  ],
  fetchResultType: t.struct({
    testKinds: m.TestKind
  }),
  fetch: () => (stq) => ({
    testKinds: module.exports.API.fetchTestKind(stq.testKindId)
  })
})

module.exports = {
  API: {},
  worklistQuery: worklistQuery,
  worklistSamplesQuery: worklistSamplesQuery,
  sampleQuery: sampleQuery,
  sampleTestsQuery: sampleTestsQuery,
  sampleTestsKindQuery: sampleTestsKindQuery
};

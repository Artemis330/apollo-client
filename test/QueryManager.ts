import {
  QueryManager,
} from '../src/QueryManager';

import { ObservableQuery } from '../src/ObservableQuery';

import { WatchQueryOptions } from '../src/watchQueryOptions';

import {
  createApolloStore,
} from '../src/store';

import {
  IdGetter,
  getIdField,
} from '../src/data/extensions';

import {
  addTypenameToSelectionSet,
} from '../src/queries/queryTransform';

import gql from 'graphql-tag';

import {
  assert,
} from 'chai';

import {
  series,
} from 'async';

import {
  Document,
  GraphQLResult,
} from 'graphql';

import ApolloClient from '../src/index';

import { createStore, combineReducers, applyMiddleware } from 'redux';

import * as Rx from 'rxjs';

import assign = require('lodash.assign');

import mockNetworkInterface from './mocks/mockNetworkInterface';

import {
  BatchedNetworkInterface,
  NetworkInterface,
} from '../src/networkInterface';

import {
  getFragmentDefinition,
} from '../src/queries/getFromAST';

import {
  ApolloError,
} from '../src/errors';

describe('QueryManager', () => {
  it('properly roundtrips through a Redux store', (done) => {
    const query = gql`
      query people {
        allPeople(first: 1) {
          people {
            name
          }
        }
      }
    `;

    const data = {
      allPeople: {
        people: [
          {
            name: 'Luke Skywalker',
          },
        ],
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query },
        result: { data },
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    const handle = queryManager.watchQuery({
      query,
    });

    handle.subscribe({
      next(result) {
        assert.deepEqual(result.data, data);
        done();
      },
    });
  });

  it('runs multiple root queries', () => {
    const query = gql`
      query people {
        allPeople(first: 1) {
          people {
            name
          }
        }
        person(id: "1") {
          name
        }
      }
    `;

    const data = {
      allPeople: {
        people: [
          {
            name: 'Luke Skywalker',
          },
        ],
      },
      person: {
        name: 'Luke Skywalker',
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query },
        result: { data },
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    return queryManager.query({
      query,
    }).then((result) => {
      assert.deepEqual(result.data, data);
    });
  });

  it('properly roundtrips through a Redux store with variables', (done) => {
    const query = gql`
      query people($firstArg: Int) {
        allPeople(first: $firstArg) {
          people {
            name
          }
        }
      }
    `;

    const variables = {
      firstArg: 1,
    };

    const data = {
      allPeople: {
        people: [
          {
            name: 'Luke Skywalker',
          },
        ],
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query, variables },
        result: { data },
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    const handle = queryManager.watchQuery({
      query,
      variables,
    });

    handle.subscribe({
      next(result) {
        assert.deepEqual(result.data, data);
        done();
      },
    });
  });

  it('handles GraphQL errors', (done) => {
    const query = gql`
      query people {
        allPeople(first: 1) {
          people {
            name
          }
        }
      }
    `;

    const networkInterface = mockNetworkInterface(
      {
        request: { query },
        result: {
          errors: [
            {
              name: 'Name',
              message: 'This is an error message.',
            },
          ],
        },
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    const handle = queryManager.watchQuery({
      query,
    });

    handle.subscribe({
      next(result) {
        done(new Error('Returned a result when it was supposed to error out'));
      },

      error(apolloError) {
        assert(apolloError);
        done();
      },
    });
  });

  it('handles GraphQL errors with data returned', (done) => {
    const query = gql`
      query people {
        allPeople(first: 1) {
          people {
            name
          }
        }
      }
    `;

    const networkInterface = mockNetworkInterface(
      {
        request: {query },
        result: {
          data: {
            allPeople: {
              people: {
                name: 'Ada Lovelace',
              },
            },
          },
          errors: [
            {
              name: 'Name',
              message: 'This is an error message.',
            },
          ],
        },
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    const handle = queryManager.watchQuery({
      query,
    });

    handle.subscribe({
      next(result) {
        done(new Error('Returned data when it was supposed to error out.'));
      },

      error(apolloError) {
        assert(apolloError);
        done();
      },
    });
  });

  it('empty error array (handle non-spec-compliant server) #156', (done) => {
    const query = gql`
      query people {
        allPeople(first: 1) {
          people {
            name
          }
        }
      }
    `;

    const networkInterface = mockNetworkInterface(
      {
        request: {query },
        result: {
          data: {
            allPeople: {
              people: {
                name: 'Ada Lovelace',
              },
            },
          },
          errors: [],
        },
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    const handle = queryManager.watchQuery({
      query,
    });

    handle.subscribe({
      next(result) {
        assert.equal(result.data['allPeople'].people.name, 'Ada Lovelace');
        assert.notProperty(result, 'errors');
        done();
      },
    });
  });

  it('handles network errors', (done) => {
    const query = gql`
      query people {
        allPeople(first: 1) {
          people {
            name
          }
        }
      }
    `;

    const networkInterface = mockNetworkInterface(
      {
        request: { query },
        error: new Error('Network error'),
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    const handle = queryManager.watchQuery({
      query,
    });

    handle.subscribe({
      next: (result) => {
        done(new Error('Should not deliver result'));
      },
      error: (error) => {
        const apolloError = error as ApolloError;
        assert(apolloError.networkError);
        assert.include(apolloError.networkError.message, 'Network error');
        done();
      },
    });
  });

  it('uses console.error to log unhandled errors', (done) => {
    const query = gql`
      query people {
        allPeople(first: 1) {
          people {
            name
          }
        }
      }
    `;

    const networkInterface = mockNetworkInterface(
      {
        request: { query },
        error: new Error('Network error'),
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    const handle = queryManager.watchQuery({
      query,
    });

    const oldError = console.error;
    let printed;
    console.error = (...args) => {
      printed = args;
    };

    handle.subscribe({
      next: (result) => {
        done(new Error('Should not deliver result'));
      },
    });

    setTimeout(() => {
      assert.match(printed[0], /error/);
      console.error = oldError;
      done();
    }, 10);
  });

  it('handles an unsubscribe action that happens before data returns', (done) => {
    const query = gql`
      query people {
        allPeople(first: 1) {
          people {
            name
          }
        }
      }
    `;

    const networkInterface = mockNetworkInterface(
      {
        request: { query },
        delay: 1000,
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    const handle = queryManager.watchQuery({
      query,
    });

    const subscription = handle.subscribe({
      next: (result) => {
        done(new Error('Should not deliver result'));
      },
      error: (error) => {
        done(new Error('Should not deliver result'));
      },
    });

    assert.doesNotThrow(subscription.unsubscribe);
    done();
  });

  it('supports interoperability with other Observable implementations like RxJS', (done) => {
    const query = gql`
      query people {
        allPeople(first: 1) {
          people {
            name
          }
        }
      }
    `;

    const data = {
      allPeople: {
        people: [
          {
            name: 'Luke Skywalker',
          },
        ],
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query },
        result: { data },
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    const handle = queryManager.watchQuery({
      query,
    });

    const observable = Rx.Observable.from(handle);

    observable
      .map(result => (assign({ fromRx: true }, result)))
      .subscribe({
      next(result) {
        const expectedResult = assign({ fromRx: true }, result);
        assert.deepEqual(result, expectedResult);
        done();
      },
    });
  });

  it('allows you to refetch queries', (done) => {
    const query = gql`
      query fetchLuke($id: String) {
        people_one(id: $id) {
          name
        }
      }
    `;

    const variables = {
      id: '1',
    };

    const data1 = {
      people_one: {
        name: 'Luke Skywalker',
      },
    };

    const data2 = {
      people_one: {
        name: 'Luke Skywalker has a new name',
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query, variables },
        result: { data: data1 },
      },
      {
        request: { query, variables },
        result: { data: data2 },
      }
    );

    const store = createApolloStore();
    const queryManager = new QueryManager({
      networkInterface,
      store: store,
      reduxRootKey: 'apollo',
    });

    let handleCount = 0;

    const handle = queryManager.watchQuery({
      query,
      variables,
    });

    handle.subscribe({
      next(result) {
        handleCount++;

        if (handleCount === 1) {
          assert.deepEqual(result.data, data1);
          handle.refetch();
        } else if (handleCount === 2) {
          assert.deepEqual(result.data, data2);
          done();
        }
      },
    });
  });

  it('allows you to refetch queries with promises', (done) => {
    const query = gql`
      {
        people_one(id: 1) {
          name
        }
      }
    `;

    const data1 = {
      people_one: {
        name: 'Luke Skywalker',
      },
    };

    const data2 = {
      people_one: {
        name: 'Luke Skywalker has a new name',
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query },
        result: { data: data1 },
      },
      {
        request: { query },
        result: { data: data2 },
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    const handle = queryManager.watchQuery({
      query,
    });

    handle.subscribe({});

    handle.refetch().then((result) => {
      assert.deepEqual(result.data, data2);
      done();
    });
  });

  it('allows you to refetch queries with new variables', (done) => {
    const query = gql`
      {
        people_one(id: 1) {
          name
        }
      }
    `;

    const data1 = {
      people_one: {
        name: 'Luke Skywalker',
      },
    };

    const data2 = {
      people_one: {
        name: 'Luke Skywalker has a new name',
      },
    };

    const data3 = {
      people_one: {
        name: 'Luke Skywalker has a new name and age',
      },
    };

    const variables = {
      test: 'I am your father',
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query: query },
        result: { data: data1 },
      },
      {
        request: { query: query },
        result: { data: data2 },
      },
      {
        request: { query: query, variables },
        result: { data: data3 },
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    let handleCount = 0;

    const handle = queryManager.watchQuery({
      query: query,
    });

    handle.subscribe({
      next(result) {
        handleCount++;

        if (handleCount === 1) {
          assert.deepEqual(result.data, data1);
          handle.refetch();
        } else if (handleCount === 2) {
          assert.deepEqual(result.data, data2);
          handle.refetch(variables);
        } else if (handleCount === 3) {
          assert.deepEqual(result.data, data3);
          done();
        }
      },
    });
  });

  it('continues to poll after refetch', (done) => {
    const query = gql`
      {
        people_one(id: 1) {
          name
        }
      }
    `;

    const data1 = {
      people_one: {
        name: 'Luke Skywalker',
      },
    };

    const data2 = {
      people_one: {
        name: 'Luke Skywalker has a new name',
      },
    };

    const data3 = {
      people_one: {
        name: 'Patsy',
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query },
        result: { data: data1 },
      },
      {
        request: { query },
        result: { data: data2 },
      },
      {
        request: { query },
        result: { data: data3 },
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    const handle = queryManager.watchQuery({
      query,
      pollInterval: 200,
    });

    let resultCount = 0;

    handle.subscribe({
      next(result) {
        resultCount++;
        // Perform refetch on first result from watchQuery
        if (resultCount === 1) {
          handle.refetch();
        };

        // Wait for a result count of 3
        if (resultCount === 3) {
          // Stop polling
          handle.stopPolling();
          assert(result);
          done();
        }
      },
    });
  });

  it('doesn\'t explode if you refetch before first fetch is done with query diffing', (done) => {
    const primeQuery = gql`
      {
        people_one(id: 1) {
          name
        }
      }
    `;

    const complexQuery = gql`
      {
        luke: people_one(id: 1) {
          name
        }
        vader: people_one(id: 4) {
          name
        }
      }
    `;

    const diffedQuery = gql`
      {
        vader: people_one(id: 4) {
          name
        }
      }
    `;

    const data1 = {
      people_one: {
        name: 'Luke Skywalker',
      },
    };

    const data2 = {
      vader: {
        name: 'Darth Vader',
      },
    };

    const dataRefetch = {
      luke: {
        name: 'Luke has a new name',
      },
      vader: {
        name: 'Vader has a new name',
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query: primeQuery },
        result: { data: data1 },
      },
      {
        request: { query: diffedQuery },
        result: { data: data2 },
        delay: 5,
      },
      {
        request: { query: complexQuery },
        result: { data: dataRefetch },
        delay: 10,
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    // First, prime the store so that query diffing removes the query
    queryManager.query({
      query: primeQuery,
    }).then(() => {
      let handleCount = 0;

      const handle = queryManager.watchQuery({
        query: complexQuery,
      });

      const subscription = handle.subscribe({
        next(result) {
          handleCount++;
          if (handleCount === 1) {
            // We never get the first fetch in the observable, because we called refetch first,
            // which means we just don't get the outdated result
            assert.deepEqual(result.data, dataRefetch);
            subscription.unsubscribe();
            done();
          }
        },
        error(error) {
          done(error);
        },
      });

      // Refetch before we get any data - maybe the network is slow, and the user clicked refresh?
      handle.refetch();
    });
  });

  it('supports returnPartialData #193', () => {
    const primeQuery = gql`
      query primeQuery {
        people_one(id: 1) {
          name
        }
      }
    `;

    const complexQuery = gql`
      query complexQuery {
        luke: people_one(id: 1) {
          name
        }
        vader: people_one(id: 4) {
          name
        }
      }
    `;

    const diffedQuery = gql`
      query complexQuery {
        vader: people_one(id: 4) {
          name
        }
      }
    `;

    const data1 = {
      people_one: {
        name: 'Luke Skywalker',
      },
    };

    const data2 = {
      vader: {
        name: 'Darth Vader',
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query: primeQuery },
        result: { data: data1 },
      },
      {
        request: { query: diffedQuery },
        result: { data: data2 },
        delay: 5,
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    // First, prime the store so that query diffing removes the query
    queryManager.query({
      query: primeQuery,
    }).then(() => {
      const handle = queryManager.watchQuery({
        query: complexQuery,
        returnPartialData: true,
      });

      return handle.result().then((result) => {
        assert.equal(result.data['luke'].name, 'Luke Skywalker');
        assert.notProperty(result.data, 'vader');
      });
    });
  });

  it('should error if we pass noFetch on a polling query', (done) => {
    const query = gql`
      query {
        author {
          firstName
          lastName
        }
      }`;
    const queryManager = new QueryManager({
      networkInterface: mockNetworkInterface(),
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });
    const handle = queryManager.watchQuery({
      query,
      pollInterval: 200,
      noFetch: true,
    });
    assert.throws(() => {
      handle.subscribe({
        next(result) {
          done(new Error('Returned a result when it should not have.'));
        },
      });
    });
    done();
  });

  it('supports noFetch fetching only cached data', () => {
    const primeQuery = gql`
      query primeQuery {
        luke: people_one(id: 1) {
          name
        }
      }
    `;

    const complexQuery = gql`
      query complexQuery {
        luke: people_one(id: 1) {
          name
        }
        vader: people_one(id: 4) {
          name
        }
      }
    `;

    const data1 = {
      luke: {
        name: 'Luke Skywalker',
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query: primeQuery },
        result: { data: data1 },
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    // First, prime the cache
    queryManager.query({
      query: primeQuery,
    }).then(() => {
      const handle = queryManager.watchQuery({
        query: complexQuery,
        noFetch: true,
      });

      return handle.result().then((result) => {
        assert.equal(result.data['luke'].name, 'Luke Skywalker');
        assert.notProperty(result.data, 'vader');
      });
    });
  });

  it('runs a mutation', () => {
    const mutation = gql`
      mutation makeListPrivate {
        makeListPrivate(id: "5")
      }
    `;

    const data = {
      makeListPrivate: true,
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query: mutation },
        result: { data },
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    return queryManager.mutate({
      mutation,
    }).then((result) => {
      assert.deepEqual(result.data, data);
    });
  });

  it('runs a mutation with variables', () => {
    const mutation = gql`
      mutation makeListPrivate($listId: ID!) {
        makeListPrivate(id: $listId)
      }
    `;

    const variables = {
      listId: '1',
    };

    const data = {
      makeListPrivate: true,
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query: mutation, variables },
        result: { data },
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    return queryManager.mutate({
      mutation,
      variables,
    }).then((result) => {
      assert.deepEqual(result.data, data);
    });
  });

  it('runs a mutation with object parameters and puts the result in the store', () => {
    const mutation = gql`
      mutation makeListPrivate {
        makeListPrivate(input: {id: "5"}) {
          id,
          isPrivate,
        }
      }
    `;

    const data = {
      makeListPrivate: {
        id: '5',
        isPrivate: true,
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query: mutation },
        result: { data },
      }
    );

    const store = createApolloStore({
      config: { dataIdFromObject: getIdField },
    });

    const queryManager = new QueryManager({
      networkInterface,
      store,
      reduxRootKey: 'apollo',
    });

    return queryManager.mutate({
      mutation,
    }).then((result) => {
      assert.deepEqual(result.data, data);

      // Make sure we updated the store with the new data
      assert.deepEqual(store.getState()['apollo'].data['5'], { id: '5', isPrivate: true });
    });
  });

  it('runs a mutation and puts the result in the store', () => {
    const mutation = gql`
      mutation makeListPrivate {
        makeListPrivate(id: "5") {
          id,
          isPrivate,
        }
      }
    `;

    const data = {
      makeListPrivate: {
        id: '5',
        isPrivate: true,
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query: mutation },
        result: { data },
      }
    );

    const store = createApolloStore({
      config: { dataIdFromObject: getIdField },
    });

    const queryManager = new QueryManager({
      networkInterface,
      store,
      reduxRootKey: 'apollo',
    });

    return queryManager.mutate({
      mutation,
    }).then((result) => {
      assert.deepEqual(result.data, data);

      // Make sure we updated the store with the new data
      assert.deepEqual(store.getState()['apollo'].data['5'], { id: '5', isPrivate: true });
    });
  });

  it('runs a mutation and puts the result in the store with root key', () => {
    const mutation = gql`
      mutation makeListPrivate {
        makeListPrivate(id: "5") {
          id,
          isPrivate,
        }
      }
    `;

    const data = {
      makeListPrivate: {
        id: '5',
        isPrivate: true,
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query: mutation },
        result: { data },
      }
    );

    const reduxRootKey = 'test';
    const store = createApolloStore({
      reduxRootKey,
      config: { dataIdFromObject: getIdField },
    });

    const queryManager = new QueryManager({
      networkInterface,
      store,
      reduxRootKey,
    });

    return queryManager.mutate({
      mutation,
    }).then((result) => {
      assert.deepEqual(result.data, data);

      // Make sure we updated the store with the new data
      assert.deepEqual(store.getState()[reduxRootKey].data['5'], { id: '5', isPrivate: true });
    });
  });

  it('diffs queries, preserving variable declarations', (done) => {
    testDiffing([
      {
        query: gql`
          {
            people_one(id: "1") {
              __typename,
              id,
              name
            }
          }
        `,
        diffedQuery: gql`
          {
            people_one(id: "1") {
              __typename,
              id,
              name
            }
          }
        `,
        diffedQueryResponse: {
          people_one: {
            __typename: 'Person',
            id: '1',
            name: 'Luke Skywalker',
          },
        },
        fullResponse: {
          people_one: {
            __typename: 'Person',
            id: '1',
            name: 'Luke Skywalker',
          },
        },
        variables: {},
      },
      {
        query: gql`
          query getSeveralPeople($lukeId: String!, $vaderId: String!) {
            luke: people_one(id: $lukeId) {
              __typename
              id
              name
            }
            vader: people_one(id: $vaderId) {
              __typename
              id
              name
            }
          }
        `,
        diffedQuery: gql`
          query getSeveralPeople($lukeId: String!, $vaderId: String!) {
            vader: people_one(id: $vaderId) {
              __typename
              id
              name
            }
          }
        `,
        diffedQueryResponse: {
          vader: {
            __typename: 'Person',
            id: '4',
            name: 'Darth Vader',
          },
        },
        fullResponse: {
          luke: {
            __typename: 'Person',
            id: '1',
            name: 'Luke Skywalker',
          },
          vader: {
            __typename: 'Person',
            id: '4',
            name: 'Darth Vader',
          },
        },
        variables: {
          lukeId: '1',
          vaderId: '4',
        },
      },
    ], {}, done);
  });

  it('does not broadcast queries when non-apollo actions are dispatched', (done) => {
    const query = gql`
      query fetchLuke($id: String) {
        people_one(id: $id) {
          name
        }
      }
    `;

    const variables = {
      id: '1',
    };

    const data1 = {
      people_one: {
        name: 'Luke Skywalker',
      },
    };

    const data2 = {
      people_one: {
        name: 'Luke Skywalker has a new name',
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query, variables },
        result: { data: data1 },
      },
      {
        request: { query, variables },
        result: { data: data2 },
      }
    );

    function testReducer (state = false, action) {
      if (action.type === 'TOGGLE') {
        return true;
      }
      return state;
    }
    const client = new ApolloClient();
    const store = createStore(
      combineReducers({
        test: testReducer,
        apollo: client.reducer(),
      }),
      applyMiddleware(client.middleware())
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: store,
      reduxRootKey: 'apollo',
    });

    const handle = queryManager.watchQuery({
      query,
      variables,
    });

    let handleCount = 0;
    handle.subscribe({
      next(result) {
        handleCount++;
        if (handleCount === 1) {
          assert.deepEqual(result.data, data1);
          return handle.refetch();
        } else if (handleCount === 2) {
          assert.deepEqual(result.data, data2);
          store.dispatch({
            type: 'TOGGLE',
          });
        }
        assert.equal(handleCount, 2);
        done();
      },
    });

  });

  it(`doesn't return data while query is loading`, (done) => {
    const query1 = gql`
      {
        people_one(id: 1) {
          name
        }
      }
    `;

    const data1 = {
      people_one: {
        name: 'Luke Skywalker',
      },
    };

    const query2 = gql`
      {
        people_one(id: 5) {
          name
        }
      }
    `;

    const data2 = {
      people_one: {
        name: 'Darth Vader',
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query: query1 },
        result: { data: data1 },
        delay: 10,
      },
      {
        request: { query: query2 },
        result: { data: data2 },
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    const handle1 = queryManager.watchQuery({
      query: query1,
    });

    const handle2 = queryManager.watchQuery({
      query: query2,
    });

    let handle1Count = 0;
    let handle2Count = 0;

    handle1.subscribe({
      next(result) {
        handle1Count++;
        checkDone();
      },
    });

    handle2.subscribe({
      next(result) {
        handle2Count++;
        checkDone();
      },
    });

    function checkDone() {
      if (handle1Count === 1 && handle2Count === 1) {
        done();
      }

      if (handle1Count > 1) {
        assert.fail();
      }
    }
  });

  it(`updates result of previous query if the result of a new query overlaps`, (done) => {
    const query1 = gql`
      {
        people_one(id: 1) {
          name
          age
        }
      }
    `;

    const data1 = {
      people_one: {
        name: 'Luke Skywalker',
        age: 50,
      },
    };

    const query2 = gql`
      {
        people_one(id: 1) {
          name
          username
        }
      }
    `;

    const data2 = {
      people_one: {
        name: 'Luke Skywalker has a new name',
        username: 'luke',
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query: query1 },
        result: { data: data1 },
      },
      {
        request: { query: query2 },
        result: { data: data2 },
        delay: 10,
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    let handle1Count = 0;

    const handle1 = queryManager.watchQuery({
      query: query1,
    });

    handle1.subscribe({
      next(result) {
        handle1Count++;

        if (handle1Count === 1) {
          assert.deepEqual(result.data, data1);

          queryManager.query({
            query: query2,
          });
        } else if (handle1Count === 2 &&
            result.data['people_one'].name === 'Luke Skywalker has a new name') {
          // 3 because the query init action for the second query causes a callback
          assert.deepEqual(result.data, {
            people_one: {
              name: 'Luke Skywalker has a new name',
              age: 50,
            },
          });

          done();
        }
      },
    });
  });

  it('allows you to poll queries', (done) => {
    const query = gql`
      query fetchLuke($id: String) {
        people_one(id: $id) {
          name
        }
      }
    `;

    const variables = {
      id: '1',
    };

    const data1 = {
      people_one: {
        name: 'Luke Skywalker',
      },
    };

    const data2 = {
      people_one: {
        name: 'Luke Skywalker has a new name',
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query, variables },
        result: { data: data1 },
      },
      {
        request: { query, variables },
        result: { data: data2 },
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    let handleCount = 0;

    const handle = queryManager.watchQuery({
      query,
      variables,
      pollInterval: 50,
    });

    const subscription = handle.subscribe({
      next(result) {
        handleCount++;

        if (handleCount === 1) {
          assert.deepEqual(result.data, data1);
        } else if (handleCount === 2) {
          assert.deepEqual(result.data, data2);
          subscription.unsubscribe();
          done();
        }
      },
    });
  });

  it('should let you handle multiple polled queries and unsubscribe from one of them', (done) => {
    const query1 = gql`
      query {
        author {
          firstName
          lastName
        }
      }`;
    const query2 = gql`
      query {
        person {
          name
        }
      }`;
    const data11 = {
      author: {
        firstName: 'John',
        lastName: 'Smith',
      },
    };
    const data12 = {
      author: {
        firstName: 'Jack',
        lastName: 'Smith',
      },
    };
    const data13 = {
      author: {
        firstName: 'Jolly',
        lastName: 'Smith',
      },
    };
    const data14 = {
      author: {
        firstName: 'Jared',
        lastName: 'Smith',
      },
    };
    const data21 = {
      person: {
        name: 'Jane Smith',
      },
    };
    const data22 = {
      person: {
        name: 'Josey Smith',
      },
    };
    const networkInterface = mockNetworkInterface(
      {
        request: { query: query1 },
        result: { data: data11 },
      },
      {
        request: { query: query1 },
        result: { data: data12 },
      },
      {
        request: { query: query1 },
        result: { data: data13},
      },
      {
        request: {query: query1 },
        result: { data: data14 },
      },
      {
        request: { query: query2 },
        result: { data: data21 },
      },
      {
        request: { query: query2 },
        result: { data: data22 },
      }
    );
    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });
    const handle1 = queryManager.watchQuery({
      query: query1,
      pollInterval: 150,
    });
    const handle2 = queryManager.watchQuery({
      query: query2,
      pollInterval: 2000,
    });
    let handle1Count = 0;
    let handleCount = 0;
    let setMilestone = false;

    const subscription1 = handle1.subscribe({
      next(result) {
        handle1Count++;
        handleCount++;
        if (handle1Count > 1 && !setMilestone) {
          subscription1.unsubscribe();
          setMilestone = true;
        }
      },
    });

    handle2.subscribe({
      next(result) {
        handleCount++;
      },
    });

    setTimeout(() => {
      assert.equal(handleCount, 3);
      done();
    }, 400);
  });

  it('allows you to unsubscribe from polled queries', (done) => {
    const query = gql`
      query fetchLuke($id: String) {
        people_one(id: $id) {
          name
        }
      }
    `;

    const variables = {
      id: '1',
    };

    const data1 = {
      people_one: {
        name: 'Luke Skywalker',
      },
    };

    const data2 = {
      people_one: {
        name: 'Luke Skywalker has a new name',
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query, variables },
        result: { data: data1 },
      },
      {
        request: { query, variables },
        result: { data: data2 },
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    let handleCount = 0;

    const handle = queryManager.watchQuery({
      query,
      variables,
      pollInterval: 50,
    });

    const subscription = handle.subscribe({
      next(result) {
        handleCount++;

        if (handleCount === 1) {
          assert.deepEqual(result.data, data1);
        } else if (handleCount === 2) {
          assert.deepEqual(result.data, data2);
          subscription.unsubscribe();
        }
      },
    });

    setTimeout(() => {
      assert.equal(handleCount, 2);
      done();
    }, 160);

  });
  it('allows you to unsubscribe from polled query errors', (done) => {
    const query = gql`
      query fetchLuke($id: String) {
        people_one(id: $id) {
          name
        }
      }
    `;

    const variables = {
      id: '1',
    };

    const data1 = {
      people_one: {
        name: 'Luke Skywalker',
      },
    };

    const data2 = {
      people_one: {
        name: 'Luke Skywalker has a new name',
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query, variables },
        result: { data: data1 },
      },
      {
        request: { query, variables },
        error: new Error('Network error'),
      },
      {
        request: { query, variables },
        result: { data: data2 },
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    let handleCount = 0;

    const handle = queryManager.watchQuery({
      query,
      variables,
      pollInterval: 50,
    });

    const subscription = handle.subscribe({
      next(result) {
        handleCount++;

        if (handleCount === 1) {
          assert.deepEqual(result.data, data1);
        } else if (handleCount === 2) {
          done(new Error('Should not deliver second result'));
        }
      },
      error: (error) => {
        assert.include(error.message, 'Network error');
        subscription.unsubscribe();
      },
    });

    setTimeout(() => {
      assert.equal(handleCount, 1);
      done();
    }, 160);

  });
  it('exposes a way to start a polling query', (done) => {
    const query = gql`
      query fetchLuke($id: String) {
        people_one(id: $id) {
          name
        }
      }
    `;

    const variables = {
      id: '1',
    };

    const data1 = {
      people_one: {
        name: 'Luke Skywalker',
      },
    };

    const data2 = {
      people_one: {
        name: 'Luke Skywalker has a new name',
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query, variables },
        result: { data: data1 },
      },
      {
        request: { query, variables },
        result: { data: data2 },
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    let handleCount = 0;

    const handle = queryManager.watchQuery({
      query,
      variables,
    });

    const subscription = handle.subscribe({
      next(result) {
        handleCount++;

        if (handleCount === 1) {
          assert.deepEqual(result.data, data1);
        } else if (handleCount === 2) {
          assert.deepEqual(result.data, data2);
          subscription.unsubscribe();
          done();
        }
      },
    });

    handle.startPolling(50);
  });
  it('exposes a way to stop a polling query', (done) => {
    const query = gql`
      query fetchLeia($id: String) {
        people_one(id: $id) {
          name
        }
      }
    `;

    const variables = {
      id: '2',
    };

    const data1 = {
      people_one: {
        name: 'Leia Skywalker',
      },
    };

    const data2 = {
      people_one: {
        name: 'Leia Skywalker has a new name',
      },
    };

    const networkInterface = mockNetworkInterface(
      {
        request: { query, variables },
        result: { data: data1 },
      },
      {
        request: { query, variables },
        result: { data: data2 },
      }
    );

    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    let handleCount = 0;

    const handle = queryManager.watchQuery({
      query,
      variables,
      pollInterval: 50,
    });

    handle.subscribe({
      next(result) {
        handleCount++;

        if (handleCount === 2) {
          handle.stopPolling();
        }
      },
    });

    setTimeout(() => {
      assert.equal(handleCount, 2);
      done();
    }, 160);

  });

  it('warns if you forget the template literal tag', () => {
    const queryManager = new QueryManager({
      networkInterface: mockNetworkInterface(),
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });

    assert.throws(() => {
      queryManager.query({
        // Bamboozle TypeScript into letting us do this
        query: 'string' as any as Document,
      });
    }, /wrap the query string in a "gql" tag/);

    assert.throws(() => {
      queryManager.mutate({
        // Bamboozle TypeScript into letting us do this
        mutation: 'string' as any as Document,
      });
    }, /wrap the query string in a "gql" tag/);

    assert.throws(() => {
      queryManager.watchQuery({
        // Bamboozle TypeScript into letting us do this
        query: 'string' as any as Document,
      });
    }, /wrap the query string in a "gql" tag/);
  });

  it('should transform queries correctly when given a QueryTransformer', (done) => {
    const query = gql`
      query {
        author {
          firstName
          lastName
        }
      }`;
    const transformedQuery = gql`
      query {
        author {
          firstName
          lastName
          __typename
        }
        __typename
      }`;
    const unmodifiedQueryResult = {
      'author': {
        'firstName': 'John',
        'lastName': 'Smith',
      },
    };
    const transformedQueryResult = {
      'author': {
        'firstName': 'John',
        'lastName': 'Smith',
        '__typename': 'Author',
      },
      '__typename': 'RootQuery',
    };

    const networkInterface = mockNetworkInterface(
    {
      request: {query},
      result: {data: unmodifiedQueryResult},
    },
    {
      request: {query: transformedQuery},
      result: {data: transformedQueryResult},
    });

    //make sure that the query is transformed within the query
    //manager
    const queryManagerWithTransformer = new QueryManager({
      networkInterface: networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
      queryTransformer: addTypenameToSelectionSet,
    });


    queryManagerWithTransformer.query({query: query}).then((result) => {
      assert.deepEqual(result.data, transformedQueryResult);
      done();
    });
  });

  it('should transform mutations correctly', (done) => {
    const mutation = gql`
      mutation {
        createAuthor(firstName: "John", lastName: "Smith") {
          firstName
          lastName
        }
      }`;
    const transformedMutation = gql`
      mutation {
        createAuthor(firstName: "John", lastName: "Smith") {
          firstName
          lastName
          __typename
        }
        __typename
      }`;
    const unmodifiedMutationResult = {
      'createAuthor': {
        'firstName': 'It works!',
        'lastName': 'It works!',
      },
    };
    const transformedMutationResult = {
      'createAuthor': {
        'firstName': 'It works!',
        'lastName': 'It works!',
        '__typename': 'Author',
      },
      '__typename': 'RootMutation',
    };

    const networkInterface = mockNetworkInterface(
    {
      request: {query: mutation},
      result: {data: unmodifiedMutationResult},
    },
    {
      request: {query: transformedMutation},
      result: {data: transformedMutationResult},
    });

    const queryManagerWithTransformer = new QueryManager({
      networkInterface: networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
      queryTransformer: addTypenameToSelectionSet,
    });

    queryManagerWithTransformer.mutate({mutation: mutation}).then((result) => {
      assert.deepEqual(result.data, transformedMutationResult);
      done();
    });
  });

  describe('batched queries', () => {
    it('should batch together two queries fired in the same batcher tick', (done) => {
      const query1 = gql`
        query {
          author {
            firstName
            lastName
          }
        }`;
      const query2 = gql`
        query {
          person {
            name
          }
        }`;
      const batchedNI: BatchedNetworkInterface = {
        query(request: Request): Promise<GraphQLResult> {
          //this should never be called.
          return null;
        },

        batchQuery(requests: Request[]): Promise<GraphQLResult[]> {
          assert.equal(requests.length, 2);
          done();
          return null;
        },
      };
      const queryManager = new QueryManager({
        networkInterface: batchedNI,
        shouldBatch: true,
        store: createApolloStore(),
        reduxRootKey: 'apollo',
      });
      queryManager.fetchQuery('fake-id', { query: query1 });
      queryManager.fetchQuery('even-more-fake-id', { query: query2 });
    });

    it('should not batch together queries that are on different batcher ticks', (done) => {
      const query1 = gql`
        query {
          author {
            firstName
            lastName
          }
        }`;
      const query2 = gql`
        query {
          person {
            name
          }
        }`;
      const batchedNI: BatchedNetworkInterface = {
        query(request: Request): Promise<GraphQLResult> {
          return null;
        },

        batchQuery(requests: Request[]): Promise<GraphQLResult[]> {
          assert.equal(requests.length, 1);
          return new Promise((resolve, reject) => {
            // never resolve the promise.
          });
        },
      };
      const queryManager = new QueryManager({
        networkInterface: batchedNI,
        shouldBatch: true,
        store: createApolloStore(),
        reduxRootKey: 'apollo',
      });
      queryManager.fetchQuery('super-fake-id', { query: query1 });
      setTimeout(() => {
        queryManager.fetchQuery('very-fake-id', { query: query2 });
        done();
      }, 100);

    });
  });

  describe('store resets', () => {
    it('should change the store state to an empty state', () => {
      const queryManager = new QueryManager({
        networkInterface: mockNetworkInterface(),
        store: createApolloStore(),
        reduxRootKey: 'apollo',
      });
      queryManager.resetStore();
      const currentState = queryManager.getApolloState();
      const expectedState = {
        data: {},
        mutations: {},
        queries: {},
        optimistic: [],
      };

      assert.deepEqual(currentState, expectedState);
    });

    it('should only refetch once when we store reset', (done) => {
      let queryManager: QueryManager = null;
      const query = gql`
        query {
          author {
            firstName
            lastName
          }
        }`;
      const data = {
        author: {
          firstName: 'John',
          lastName: 'Smith',
        },
      };

      let timesFired = 0;
      let numResults = 0;
      const myNetworkInterface: NetworkInterface = {
        query(request: Request): Promise<GraphQLResult> {
          if (timesFired === 0) {
            timesFired += 1;
            queryManager.resetStore();
          } else {
            timesFired += 1;
          }
          return Promise.resolve({ data });
        },
      };

      queryManager = new QueryManager({
        networkInterface: myNetworkInterface,
        store: createApolloStore(),
        reduxRootKey: 'apollo',
      });

      const handle = queryManager.watchQuery({ query });
      handle.subscribe({
        next(result) {
          numResults += 1;
        },

        error(err) {
          done(new Error('Errored on observable on store reset.'));
        },
      });

      setTimeout(() => {
        assert.equal(timesFired, 2);
        assert.equal(numResults, 1);
        done();
      }, 100);
    });


    it('should throw an error on an inflight fetch query if the store is reset', (done) => {
      const query = gql`
        query {
          author {
            firstName
            lastName
          }
        }`;
      const data = {
        author: {
          firstName: 'John',
          lastName: 'Smith',
        },
      };
      const queryManager = new QueryManager({
        networkInterface: mockNetworkInterface({
          request: { query },
          result: { data },
          delay: 10000, //i.e. forever
        }),
        store: createApolloStore(),
        reduxRootKey: 'apollo',
      });

      queryManager.fetchQuery('made up id', { query }).then((result) => {
        assert(false); //we don't want this promise to ever resolve correctly
        done();
      }).catch((error) => {
        assert.include(error.message, 'Store reset');
        done();
      });
      queryManager.resetStore();
    });

    it('should call refetch on a mocked Observable if the store is reset', (done) => {
      const query = gql`
        query {
          author {
            firstName
            lastName
          }
        }`;
      const queryManager = new QueryManager({
        networkInterface: mockNetworkInterface(),
        store: createApolloStore(),
        reduxRootKey: 'apollo',
      });
      const mockObservableQuery: ObservableQuery = {
        refetch(variables: any): Promise<GraphQLResult> {
          done();
          return null;
        },
        options: {
          query: query,
        },
        scheduler: queryManager.scheduler,
      } as any as ObservableQuery;

      const queryId = 'super-fake-id';
      queryManager.addObservableQuery(queryId, mockObservableQuery);
      queryManager.resetStore();
    });

    it('should not call refetch on a noFetch Observable if the store is reset', (done) => {
      const query = gql`
        query {
          author {
            firstName
            lastName
          }
        }`;
      const queryManager = new QueryManager({
        networkInterface: mockNetworkInterface(),
        store: createApolloStore(),
        reduxRootKey: 'apollo',
      });
      const options = assign({}) as WatchQueryOptions;
      options.noFetch = true;
      options.query = query;
      let refetchCount = 0;
      const mockObservableQuery: ObservableQuery = {
        refetch(variables: any): Promise<GraphQLResult> {
          refetchCount ++;
          done();
          return null;
        },
        options,
        queryManager: queryManager,
      } as any as ObservableQuery;

      const queryId = 'super-fake-id';
      queryManager.addObservableQuery(queryId, mockObservableQuery);
      queryManager.resetStore();
      setTimeout(() => {
        assert.equal(refetchCount, 0);
        done();
      }, 400);

    });

    it('should throw an error on an inflight query() if the store is reset', (done) => {
      let queryManager: QueryManager = null;
      const query = gql`
        query {
          author {
            firstName
            lastName
          }
        }`;

      const data = {
        author: {
          firstName: 'John',
          lastName: 'Smith',
        },
      };

      const myNetworkInterface: NetworkInterface = {
        query(request: Request): Promise<GraphQLResult> {
          // reset the store as soon as we hear about the query
          queryManager.resetStore();
          return Promise.resolve({ data });
        },
      };

      queryManager = new QueryManager({
        networkInterface: myNetworkInterface,
        store: createApolloStore(),
        reduxRootKey: 'apollo',
      });

      queryManager.query({ query }).then((result) => {
        done(new Error('query() gave results on a store reset'));
      }).catch((error) => {
        done();
      });
    });
  });

  describe('fragment referencing', () => {
    it('should accept a list of fragments and let us reference them through fetchQuery', (done) => {
      const fragment1 = getFragmentDefinition(gql`
        fragment authorDetails on Author {
          firstName
          lastName
        }`);
      const fragment2 = getFragmentDefinition(gql`
        fragment personDetails on Person {
          name
        }`);
      const fragments = [fragment1, fragment2];
      const query = gql`
        query {
          author {
            ...authorDetails
          }
          person {
            ...personDetails
          }
        }`;
      const composedQuery = gql`
        query {
          author {
            ...authorDetails
          }
          person {
            ...personDetails
          }
        }
        fragment authorDetails on Author {
          firstName
          lastName
        }
        fragment personDetails on Person {
          name
        }`;
      const data = {
        'author': {
          'firstName': 'John',
          'lastName': 'Smith',
        },
        'person': {
          'name': 'John Smith',
        },
      };
      const networkInterface = mockNetworkInterface({
        request: { query: composedQuery },
        result: { data },
      });
      const queryManager = new QueryManager({
        networkInterface: networkInterface,
        store: createApolloStore(),
        reduxRootKey: 'apollo',
      });

      queryManager.fetchQuery('bad-id', { query, fragments }).then((result) => {
        assert.deepEqual(result, { data });
        done();
      });
    });
    it('should accept a list of fragments and let us reference them from mutate', (done) => {
      const fragment1 = getFragmentDefinition(gql`
        fragment authorDetails on Author {
          firstName
          lastName
        }`);
      const fragment2 = getFragmentDefinition(gql`
        fragment personDetails on Person {
          name
        }`);
      const fragments = [fragment1, fragment2];
      const mutation = gql`
        mutation changeStuff {
          changeStuff {
            author {
              ...authorDetails
            }
            person {
              ...personDetails
            }
          }
       }`;
      const composedMutation = gql`
        mutation changeStuff {
          changeStuff {
            author {
              ...authorDetails
            }
            person {
              ...personDetails
            }
          }
       }
       fragment authorDetails on Author {
         firstName
         lastName
       }
       fragment personDetails on Person {
         name
       }`;

      const data = {
        changeStuff: {
          author: {
            firstName: 'John',
            lastName: 'Smith',
          },
          person: {
            name: 'John Smith',
          },
        },
      };

      const networkInterface = mockNetworkInterface({
        request: { query: composedMutation },
        result: { data },
      });
      const queryManager = new QueryManager({
        networkInterface: networkInterface,
        store: createApolloStore(),
        reduxRootKey: 'apollo',
      });

      queryManager.mutate({ mutation, fragments }).then((result) => {
        assert.deepEqual(result, { data });
        done();
      });
    });
  });

  it('should reject a fetchQuery promise given a network error', (done) => {
    const query = gql`
      query {
        author {
          firstName
          lastName
        }
      }`;
    const networkError = new Error('Network error');
    const networkInterface = mockNetworkInterface({
      request: { query },
      error: networkError,
    });
    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });
    queryManager.fetchQuery('fake-id', { query }).then((result) => {
      done(new Error('Returned result on an errored fetchQuery'));
    }).catch((error) => {
      const apolloError = error as ApolloError;

      assert(apolloError.message);
      assert.equal(apolloError.networkError, networkError);
      assert(!apolloError.graphQLErrors);
      done();
    });
  });

  it('should error when we attempt to give an id beginning with $', (done) => {
    const query = gql`
      query {
        author {
          firstName
          lastName
          id
          __typename
        }
      }`;
    const data = {
      author: {
        firstName: 'John',
        lastName: 'Smith',
        id: '129',
        __typename: 'Author',
      },
    };
    const networkInterface = mockNetworkInterface({
      request: { query },
      result: { data },
    });

    const reducerConfig = {
      dataIdFromObject: (object) => {
        if (object.__typename && object.id) {
          return '$' + object.__typename + '__' + object.id;
        }
      },
    };
    const store = createApolloStore({ config: reducerConfig, reportCrashes: false });
    const queryManager = new QueryManager({
      networkInterface,
      store,
      reduxRootKey: 'apollo',
    });

    queryManager.query({ query }).then((result) => {
      done(new Error('Returned a result when it should not have.'));
    }).catch((error) => {
      done();
    });
  });

  it('should reject a fetchQuery promise given a GraphQL error', (done) => {
    const query = gql`
      query {
        author {
          firstName
          lastName
        }
      }`;
    const graphQLErrors = [new Error('GraphQL error')];
    const networkInterface = mockNetworkInterface({
      request: { query },
      result: { errors: graphQLErrors },
    });
    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });
    queryManager.fetchQuery('fake-id', { query }).then((result) => {
      done(new Error('Returned result on an errored fetchQuery'));
    }).catch((error) => {
      const apolloError = error as ApolloError;
      assert(apolloError.message);
      assert.equal(apolloError.graphQLErrors, graphQLErrors);
      assert(!apolloError.networkError);
      done();
    });
  });

  it('should not empty the store when a non-polling query fails due to a network error', (done) => {
    const query = gql`
      query {
        author {
          firstName
          lastName
        }
      }`;
    const data = {
      author: {
        firstName: 'Dhaivat',
        lastName: 'Pandya',
      },
    };
    const networkInterface = mockNetworkInterface(
      {
        request: { query },
        result: { data },
      },
      {
        request: { query },
        error: new Error('Network error ocurred'),
      }
    );
    const store = createApolloStore();
    const queryManager = new QueryManager({
      networkInterface,
      store,
      reduxRootKey: 'apollo',
    });
    queryManager.query({ query }).then((result) => {
      assert.deepEqual(result, { data });

      queryManager.query({ query, forceFetch: true }).then(() => {
        done(new Error('Returned a result when it was not supposed to.'));
      }).catch((error) => {
        // make that the error thrown doesn't empty the state
        assert.deepEqual(store.getState().apollo.data['$ROOT_QUERY.author'], data['author']);
        done();
      });
    }).catch((error) => {
      done(new Error('Threw an error on the first query.'));
    });
  });

  it('should be able to unsubscribe from a polling query subscription', (done) => {
    const query = gql`
      query {
        author {
          firstName
          lastName
        }
      }`;
    const data = {
      author: {
        firstName: 'John',
        lastName: 'Smith',
      },
    };
    const networkInterface = mockNetworkInterface(
      {
        request: { query },
        result: { data },
      }
    );
    const queryManager = new QueryManager({
      networkInterface,
      store: createApolloStore(),
      reduxRootKey: 'apollo',
    });
    const observableQuery = queryManager.watchQuery({ query, pollInterval: 20 });
    let timesFired = 0;
    const subscription = observableQuery.subscribe({
      next(result) {
        timesFired += 1;
        subscription.unsubscribe();
      },
    });

    setTimeout(() => {
      assert.equal(timesFired, 1);
      done();
    }, 60);
  });

  it('should not empty the store when a polling query fails due to a network error', (done) => {
    const query = gql`
      query {
        author {
          firstName
          lastName
        }
      }`;
    const data = {
      author: {
        firstName: 'John',
        lastName: 'Smith',
      },
    };
    const networkInterface = mockNetworkInterface(
      {
        request: { query },
        result: { data },
      },
      {
        request: { query },
        error: new Error('Network error occurred.'),
      }
    );
    const store = createApolloStore();
    const queryManager = new QueryManager({
      networkInterface,
      store,
      reduxRootKey: 'apollo',
    });
    const handle = queryManager.watchQuery({ query, pollInterval: 20 });
    const subscription = handle.subscribe({
      next(result) {
        assert.deepEqual(result, { data });
        assert.deepEqual(store.getState().apollo.data['$ROOT_QUERY.author'], data.author);
      },

      error(error) {
        assert.deepEqual(store.getState().apollo.data['$ROOT_QUERY.author'], data.author);
        subscription.unsubscribe();
      },
    });
    setTimeout(() => {
      done();
    }, 100);
  });

  it('should not fire next on an observer if there is no change in the result', (done) => {
    const query = gql`
      query {
        author {
          firstName
          lastName
        }
      }`;

    const data = {
      author: {
        firstName: 'John',
        lastName: 'Smith',
      },
    };
    const networkInterface = mockNetworkInterface(
      {
        request: { query },
        result: { data },
      },

      {
        request: { query },
        result: { data },
      }
    );
    const queryManager = new QueryManager({
      store: createApolloStore(),
      reduxRootKey: 'apollo',
      networkInterface,
    });
    const handle = queryManager.watchQuery({ query });
    let timesFired = 0;
     handle.subscribe({
      next(result) {
        timesFired += 1;
        assert.deepEqual(result, { data });
      },
    });
    queryManager.query({ query }).then((result) => {
      assert.deepEqual(result, { data });
      assert.equal(timesFired, 1);
      done();
    });
  });

  it('should error when we orphan a real-id node in the store with a real-id node', (done) => {
    const query1 = gql`
      query {
        author {
          name {
            firstName
            lastName
          }
          age
          id
          __typename
        }
      }
    `;
    const query2 = gql`
      query {
        author {
          name {
            firstName
          }
          id
          __typename
        }
      }`;
    const data1 = {
      author: {
        name: {
          firstName: 'John',
          lastName: 'Smith',
        },
        age: 18,
        id: '187',
        __typename: 'Author',
      },
    };
    const data2 = {
      author: {
        name: {
          firstName: 'John',
        },
        age: 18,
        id: '197',
        __typename: 'Author',
      },
    };
    const networkInterface = mockNetworkInterface(
      {
        request: { query: query1 },
        result: { data: data1 },
      },
      {
        request: { query: query2 },
        result: { data: data2 },
      }
    );
    const reducerConfig = {
      dataIdFromObject: (object) => {
        if (object.__typename && object.id) {
          return object.__typename + '__' + object.id;
        }
      },
    };
    const store = createApolloStore({ config: reducerConfig, reportCrashes: false });
    const queryManager = new QueryManager({
      networkInterface,
      store,
      reduxRootKey: 'apollo',
    });

    let resultsReceived1 = 0;
    let resultsReceived2 = 0;
    let errorsReceived1 = 0;

    const handle1 = queryManager.watchQuery({ query: query1 });
    const handle2 = queryManager.watchQuery({ query: query2 });
    handle1.subscribe({
      next(result) {
        resultsReceived1 += 1;
      },

      error(error) {
        assert(error);
        errorsReceived1 += 1;
      },
    });

    handle2.subscribe({
      next(result) {
        resultsReceived2 += 1;
      },

      error(error) {
        done(new Error('Erorred on the second handler.'));
      },
    });

    setTimeout(() => {
      assert.equal(resultsReceived1, 1);
      assert.equal(resultsReceived2, 1);
      assert.equal(errorsReceived1, 1);
      done();
    }, 60);
  });


  it('should error if we replace a real id node in the store with a generated id node', (done) => {
    const queryWithId = gql`
      query {
        author {
          firstName
          lastName
          __typename
          id
        }
      }`;
    const dataWithId = {
      author: {
        firstName: 'John',
        lastName: 'Smith',
        id: '129',
        __typename: 'Author',
      },
    };
    const queryWithoutId = gql`
      query {
        author {
          address
        }
      }`;
    const dataWithoutId = {
      author: {
        address: 'fake address',
      },
    };
    const networkInterface = mockNetworkInterface(
      {
        request: { query: queryWithId },
        result: { data: dataWithId },
      },
      {
        request: { query: queryWithoutId },
        result: { data: dataWithoutId },
      }
    );
    const reducerConfig = {
      dataIdFromObject: (object) => {
        if (object.__typename && object.id) {
          return object.__typename + '__' + object.id;
        }
      },
    };
    const store = createApolloStore({ config: reducerConfig, reportCrashes: false });
    const queryManager = new QueryManager({
      networkInterface,
      store,
      reduxRootKey: 'apollo',
    });
    const handleWithId = queryManager.watchQuery({ query: queryWithId });
    const handleWithoutId = queryManager.watchQuery({ query: queryWithoutId });
    let withIdResults = 0;
    let withIdErrors = 0;
    let withoutIdResults = 0;
    let withoutIdErrors = 0;

    handleWithId.subscribe({
      next(result) {
        withIdResults += 1;
      },
      error(error) {
        withIdErrors += 1;
      },
    });

    handleWithoutId.subscribe({
      next(result) {
        withoutIdResults += 1;
      },
      error(error) {
        assert.include(error.message, 'Store error: ');
        withoutIdErrors += 1;
      },
    });

    setTimeout(() => {
      assert.equal(withIdResults, 1);
      assert.equal(withIdErrors, 0);
      assert.equal(withoutIdResults, 0);
      assert.equal(withoutIdErrors, 1);
      done();
    }, 60);
  });

  it('should not error when merging a generated id store node  with a real id node', (done) => {
    const queryWithoutId = gql`
      query {
        author {
          name {
            firstName
            lastName
          }
          age
          __typename
        }
      }`;
    const queryWithId = gql`
      query {
        author {
          name {
            firstName
          }
          id
          __typename
        }
      }`;
    const dataWithoutId = {
      author: {
        name: {
          firstName: 'John',
          lastName: 'Smith',
        },
        age: '124',
        __typename: 'Author',
      },
    };
    const dataWithId = {
      author: {
        name: {
          firstName: 'Jane',
        },
        id: '129',
        __typename: 'Author',
      },
    };
    const networkInterface = mockNetworkInterface(
      {
        request: { query: queryWithoutId },
        result: { data: dataWithoutId },
      },
      {
        request: { query: queryWithId },
        result: { data: dataWithId },
      }
    );

    const reducerConfig = {
      dataIdFromObject: (object) => {
        if (object.__typename && object.id) {
          return object.__typename + '__' + object.id;
        }
      },
    };
    const store = createApolloStore({ config: reducerConfig });
    const queryManager = new QueryManager({
      networkInterface,
      store,
      reduxRootKey: 'apollo',
    });
    let withoutIdResultsReceived = 0;
    let withIdResultsReceived = 0;
    const handleWithoutId = queryManager.watchQuery({ query: queryWithoutId });
    const handleWithId = queryManager.watchQuery({ query: queryWithId });

    handleWithoutId.subscribe({
      next(result) {
        withoutIdResultsReceived += 1;
        assert.deepEqual(result, { data: dataWithoutId } );
      },
    });

    handleWithId.subscribe({
      next(result) {
        withIdResultsReceived += 1;
        assert.deepEqual(result, { data: dataWithId });
      },
    });

    setTimeout(() => {
      assert.equal(withoutIdResultsReceived, 2);
      assert.equal(withIdResultsReceived, 1);
      done();
    }, 120);
  });
});

function testDiffing(
  queryArray: {
    // The query the UI asks for
    query: Document,

    // The query that we expect to be sent to the server
    diffedQuery: Document,

    // The response the server would return for the diffedQuery
    diffedQueryResponse: any,

    // The result the actual UI receives, after all data is fetched
    fullResponse: any,

    // Variables to use in all queries
    variables?: Object,
  }[],
  config: {
    dataIdFromObject?: IdGetter,
  },
  done: () => void
) {
  const mockedResponses = queryArray.map(({
    diffedQuery,
    diffedQueryResponse,
    variables = {},
  }) => {
    return {
      request: { query: diffedQuery, variables },
      result: { data: diffedQueryResponse },
    };
  });
  const networkInterface = mockNetworkInterface(...mockedResponses);

  const queryManager = new QueryManager({
    networkInterface,
    store: createApolloStore({
      config: { dataIdFromObject: getIdField },
    }),
    reduxRootKey: 'apollo',
  });

  const steps = queryArray.map(({ query, fullResponse, variables }) => {
    return (cb) => {
      queryManager.query({
        query,
        variables,
      }).then((result) => {
        assert.deepEqual(result.data, fullResponse);
        cb();
      });
    };
  });

  series(steps, (err, res) => {
    if (err) {
      throw err;
    }

    done();
  });
}

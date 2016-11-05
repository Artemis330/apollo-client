import {
  QueryManager,
} from '../src/core/QueryManager';

import mockQueryManager from './mocks/mockQueryManager';

import mockWatchQuery from './mocks/mockWatchQuery';

import { ObservableQuery } from '../src/core/ObservableQuery';

import { WatchQueryOptions } from '../src/core/watchQueryOptions';

import {
  createApolloStore,
  ApolloStore,
} from '../src/store';

import {
  getIdField,
} from '../src/data/extensions';

import gql from 'graphql-tag';

import {
  assert,
} from 'chai';

import {
  Document,
  GraphQLResult,
} from 'graphql';

import ApolloClient, {
  ApolloStateSelector,
} from '../src/ApolloClient';

import {
  ApolloQueryResult,
} from '../src/core/QueryManager';

import { createStore, combineReducers, applyMiddleware } from 'redux';

import * as Rx from 'rxjs';

import assign = require('lodash.assign');

import mockNetworkInterface, {
  ParsedRequest,
} from './mocks/mockNetworkInterface';

import {
  NetworkInterface,
} from '../src/transport/networkInterface';

import {
  ApolloError,
} from '../src/errors/ApolloError';

import {
  Observer,
} from '../src/util/Observable';

import { NetworkStatus } from '../src/queries/store';

import wrap from './util/wrap';

import observableToPromise, {
  observableToPromiseAndSubscription,
} from './util/observableToPromise';

describe('QueryManager', () => {

  // Standard "get id from object" method.
  const dataIdFromObject = (object: any) => {
    if (object.__typename && object.id) {
      return object.__typename + '__' + object.id;
    }
    return undefined;
  };

  const defaultReduxRootSelector = (state: any) => state.apollo;

  // Helper method that serves as the constructor method for
  // QueryManager but has defaults that make sense for these
  // tests.
  const createQueryManager = ({
    networkInterface,
    store,
    reduxRootSelector,
    addTypename = false,
  }: {
    networkInterface?: NetworkInterface,
    store?: ApolloStore,
    reduxRootSelector?: ApolloStateSelector,
    addTypename?: boolean,
  }) => {

    return new QueryManager({
      networkInterface: networkInterface || mockNetworkInterface(),
      store: store || createApolloStore(),
      reduxRootSelector: reduxRootSelector || defaultReduxRootSelector,
      addTypename,
    });
  };

  // Helper method that sets up a mockQueryManager and then passes on the
  // results to an observer.
  const assertWithObserver = ({
    done,
    query,
    variables = {},
    queryOptions = {},
    result,
    error,
    delay,
    observer,
  }: {
    done: MochaDone,
    query: Document,
    variables?: Object,
    queryOptions?: Object,
    error?: Error,
    result?: GraphQLResult,
    delay?: number,
    observer: Observer<ApolloQueryResult>,
  }) => {
    const queryManager = mockQueryManager({
      request: { query, variables },
      result,
      error,
      delay,
    });
    const finalOptions = assign({ query, variables }, queryOptions) as WatchQueryOptions;
    return queryManager.watchQuery(finalOptions).subscribe({
      next: wrap(done, observer.next),
      error: observer.error,
    });
  };

  // Helper method that asserts whether a particular query correctly returns
  // a given piece of data.
  const assertRoundtrip = ({
    done,
    query,
    data,
    variables = {},
  }: {
    done: MochaDone,
    query: Document,
    data: Object,
    variables?: Object
  }) => {
    assertWithObserver({
      done,
      query,
      result: { data },
      variables,
      observer: {
        next(result) {
          assert.deepEqual(result.data, data, 'Roundtrip assertion failed.');
          done();
        },
      },
    });
  };

  const mockMutation = ({
    mutation,
    data,
    variables = {},
    store,
  }: {
    mutation: Document,
    data: Object,
    variables?: Object,
    store?: ApolloStore,
  }) => {
    if (!store) {
      store = createApolloStore();
    }
    const networkInterface = mockNetworkInterface({
      request: { query: mutation, variables },
      result: { data },
    });
    const queryManager = createQueryManager({ networkInterface, store });
    return new Promise<{ result: GraphQLResult, queryManager: QueryManager }>((resolve, reject) => {
      queryManager.mutate({ mutation, variables }).then((result) => {
        resolve({ result, queryManager });
      }).catch((error) => {
        reject(error);
      });
    });
  };

  const assertMutationRoundtrip = (opts: {
    mutation: Document,
    data: Object,
    variables?: Object,
  }) => {
    return mockMutation(opts).then(({ result }) => {
      assert.deepEqual(result.data, opts.data);
    });
  };

  // Helper method that takes a query with a first response and a second response.
  // Used to assert stuff about refetches.
  const mockRefetch = ({
    request,
    firstResult,
    secondResult,
  }: {
    request: ParsedRequest,
    firstResult: GraphQLResult,
    secondResult: GraphQLResult,
  }) => {
    return mockQueryManager(
      {
        request,
        result: firstResult,
      },
      {
        request,
        result: secondResult,
      }
    );
  };

  it('properly roundtrips through a Redux store', (done) => {
    assertRoundtrip({
      query: gql`
      query people {
        allPeople(first: 1) {
          people {
            name
          }
        }
      }`,
      data: {
        allPeople: {
          people: [
            {
              name: 'Luke Skywalker',
            },
          ],
        },
      },
      done,
    });
  });

  it('runs multiple root queries', (done) => {
    assertRoundtrip({
      query: gql`
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
    `,
      data: {
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
      },
      done,
    });
  });

  it('properly roundtrips through a Redux store with variables', (done) => {
    assertRoundtrip({
      query: gql`
      query people($firstArg: Int) {
        allPeople(first: $firstArg) {
          people {
            name
          }
        }
      }`,

      variables: {
        firstArg: 1,
      },

      data: {
        allPeople: {
          people: [
            {
              name: 'Luke Skywalker',
            },
          ],
        },
      },
      done,
    });
  });

  it('handles GraphQL errors', (done) => {
    assertWithObserver({
      done,
      query: gql`
          query people {
            allPeople(first: 1) {
              people {
                name
              }
            }
          }`,
      variables: {},
      result: {
        errors: [
          {
            name: 'Name',
            message: 'This is an error message.',
          },
        ],
      },
      observer: {
        next(result) {
          done(new Error('Returned a result when it was supposed to error out'));
        },

        error(apolloError) {
          assert(apolloError);
          done();
        },
      },
    });
  });

  it('handles GraphQL errors with data returned', (done) => {
    assertWithObserver({
      done,
      query: gql`
      query people {
        allPeople(first: 1) {
          people {
            name
          }
        }
      }`,
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
      observer: {
        next(result) {
          done(new Error('Returned data when it was supposed to error out.'));
        },

        error(apolloError) {
          assert(apolloError);
          done();
        },
      },
    });

  });

  it('empty error array (handle non-spec-compliant server) #156', (done) => {
    assertWithObserver({
      done,
      query: gql`
      query people {
        allPeople(first: 1) {
          people {
            name
          }
        }
      }`,
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
      observer: {
        next(result) {
          assert.equal(result.data['allPeople'].people.name, 'Ada Lovelace');
          assert.notProperty(result, 'errors');
          done();
        },
      },
    });
  });

  it('handles network errors', (done) => {
    assertWithObserver({
      done,
      query: gql`
      query people {
        allPeople(first: 1) {
          people {
            name
          }
        }
      }`,
      error: new Error('Network error'),
      observer: {
        next: (result) => {
          done(new Error('Should not deliver result'));
        },
        error: (error) => {
          const apolloError = error as ApolloError;
          assert(apolloError.networkError);
          assert.include(apolloError.networkError.message, 'Network error');
          done();
        },
      },
    });
  });

  it('uses console.error to log unhandled errors', (done) => {
    const oldError = console.error;
    let printed: any;
    console.error = (...args: any[]) => {
      printed = args;
    };

    assertWithObserver({
      done,
      query: gql`
      query people {
        allPeople(first: 1) {
          people {
            name
          }
        }
      }`,
      error: new Error('Network error'),
      observer: {
        next: (result) => {
          done(new Error('Should not deliver result'));
        },
      },
    });

    setTimeout(() => {
      assert.match(printed[0], /error/);
      console.error = oldError;
      done();
    }, 10);
  });

  it('handles an unsubscribe action that happens before data returns', (done) => {
    const subscription = assertWithObserver({
      done,
      query: gql`
      query people {
        allPeople(first: 1) {
          people {
            name
          }
        }
      }`,
      delay: 1000,
      observer: {
        next: (result) => {
          done(new Error('Should not deliver result'));
        },
        error: (error) => {
          done(new Error('Should not deliver result'));
        },
      },
    });

    assert.doesNotThrow(subscription.unsubscribe);
    done();
  });

  it('supports interoperability with other Observable implementations like RxJS', (done) => {
    const expResult = {
      data: {
        allPeople: {
          people: [
            {
              name: 'Luke Skywalker',
            },
          ],
        },
      },
    };

    const handle = mockWatchQuery({
      request: {
        query: gql`
          query people {
            allPeople(first: 1) {
              people {
              name
            }
          }
        }`,
      },
      result: expResult,
    });

    const observable = Rx.Observable.from(handle);


    observable
      .map(result => (assign({ fromRx: true }, result)))
      .subscribe({
      next: wrap(done, (newResult) => {
        const expectedResult = assign({ fromRx: true, loading: false, networkStatus: 7 }, expResult);
        assert.deepEqual(newResult, expectedResult);
        done();
      }),
    });
  });

  it('allows you to subscribe twice to the one query', (done) => {
    const request = {
      query: gql`
        query fetchLuke($id: String) {
          people_one(id: $id) {
            name
          }
        }`,
      variables: {
        id: '1',
      },
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

    const data3 = {
      people_one: {
        name: 'Luke Skywalker has another name',
      },
    };

    const queryManager = mockQueryManager({
      request,
      result: { data: data1 },
    }, {
      request,
      result: { data: data2 },

      // Wait for both to subscribe
      delay: 100,
    }, {
      request,
      result: { data: data3 },
    });

    let subOneCount = 0;

    // pre populate data to avoid contention
    queryManager.query(request)
      .then(() => {
        const handle = queryManager.watchQuery(request);

        const subOne = handle.subscribe({
          next(result) {
            subOneCount++;

            if (subOneCount === 1) {
              assert.deepEqual(result.data, data1);
            } else if (subOneCount === 2) {
              assert.deepEqual(result.data, data2);
            }
          },
        });

        let subTwoCount = 0;
        handle.subscribe({
          next(result) {
            subTwoCount++;
            if (subTwoCount === 1) {
              assert.deepEqual(result.data, data1);
              handle.refetch();
            } else if (subTwoCount === 2) {
              assert.deepEqual(result.data, data2);
              setTimeout(() => {
                try {
                  assert.equal(subOneCount, 2);

                  subOne.unsubscribe();
                  handle.refetch();
                } catch (e) { done(e); }
              }, 0);
            } else if (subTwoCount === 3) {
              setTimeout(() => {
                try {
                  assert.equal(subOneCount, 2);
                  done();
                } catch (e) { done(e); }
              }, 0);
            }
          },
        });
      });
  });

  it('allows you to refetch queries', () => {
    const request = {
      query: gql`
        query fetchLuke($id: String) {
          people_one(id: $id) {
            name
          }
        }`,
      variables: {
        id: '1',
      },
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

    const queryManager = mockRefetch({
      request,
      firstResult: { data: data1 },
      secondResult: { data: data2 },
    });

    const observable = queryManager.watchQuery(request);
    return observableToPromise({ observable },
      (result) => {
        assert.deepEqual(result.data, data1);
        observable.refetch();
      },
      (result) => assert.deepEqual(result.data, data2)
    );
  });

  it('sets networkStatus to `refetch` when refetching', () => {
    const request = {
      query: gql`
        query fetchLuke($id: String) {
          people_one(id: $id) {
            name
          }
        }`,
      variables: {
        id: '1',
      },
      notifyOnNetworkStatusChange: true,
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

    const queryManager = mockRefetch({
      request,
      firstResult: { data: data1 },
      secondResult: { data: data2 },
    });

    const observable = queryManager.watchQuery(request);
    return observableToPromise({ observable },
      (result) => {
        assert.deepEqual(result.data, data1);
        observable.refetch();
      },
      (result) => assert.equal(result.networkStatus, NetworkStatus.refetch),
      (result) => {
        assert.equal(result.networkStatus, NetworkStatus.ready);
        assert.deepEqual(result.data, data2);
      }
    );
  });

  it('allows you to refetch queries with promises', () => {
    const request = {
      query: gql`
      {
        people_one(id: 1) {
          name
        }
      }`,
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

    const queryManager = mockRefetch({
      request,
      firstResult: { data: data1 },
      secondResult: { data: data2 },
    });

    const handle = queryManager.watchQuery(request);
    handle.subscribe({});

    return handle.refetch().then(
      (result) => assert.deepEqual(result.data, data2)
    );
  });

  it('allows you to refetch queries with new variables', () => {
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

    const data4 = {
      people_one: {
        name: 'Luke Skywalker has a whole new bag',
      },
    };

    const variables1 = {
      test: 'I am your father',
    };

    const variables2 = {
      test: "No. No! That's not true! That's impossible!",
    };

    const queryManager = mockQueryManager(
      {
        request: { query: query },
        result: { data: data1 },
      },
      {
        request: { query: query },
        result: { data: data2 },
      },
      {
        request: { query: query, variables: variables1 },
        result: { data: data3 },
      },
      {
        request: { query: query, variables: variables2 },
        result: { data: data4 },
      }
    );

    const observable = queryManager.watchQuery({ query });
    return observableToPromise({ observable },
      (result) => {
        assert.deepEqual(result.data, data1);
        observable.refetch();
      },
      (result) => {
        assert.deepEqual(result.data, data2);
        observable.refetch(variables1);
      },
      (result) => {
        assert.isTrue(result.loading);
        assert.deepEqual(result.data, data2);
      },
      (result) => {
        assert.deepEqual(result.data, data3);
        observable.refetch(variables2);
      },
      (result) => {
        assert.isTrue(result.loading);
        assert.deepEqual(result.data, data3);
      },
      (result) => {
        assert.deepEqual(result.data, data4);
      }
    );
  });

  it('only modifies varaibles when refetching', () => {
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

    const queryManager = mockQueryManager(
      {
        request: { query: query },
        result: { data: data1 },
      },
      {
        request: { query: query },
        result: { data: data2 },
      }
    );

    const observable = queryManager.watchQuery({ query });
    const originalOptions = assign({}, observable.options);
    return observableToPromise({ observable },
      (result) => {
        assert.deepEqual(result.data, data1);
        observable.refetch();
      },
      (result) => {
        assert.deepEqual(result.data, data2);
        const updatedOptions = assign({}, observable.options);
        delete originalOptions.variables;
        delete updatedOptions.variables;
        assert.deepEqual(updatedOptions, originalOptions);
      }
    );
  });

  it('continues to poll after refetch', () => {
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

    const queryManager = mockQueryManager(
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

    const observable = queryManager.watchQuery({
      query,
      pollInterval: 200,
    });

    return observableToPromise({ observable },
      (result) => {
        assert.deepEqual(result.data, data1);
        observable.refetch();
      },
      (result) => assert.deepEqual(result.data, data2),
      (result) => {
        assert.deepEqual(result.data, data3);
        observable.stopPolling();
        assert(result);
      }
    );
  });

  it('sets networkStatus to `poll` if a polling query is in flight', (done) => {
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

    const queryManager = mockQueryManager(
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

    const observable = queryManager.watchQuery({
      query,
      pollInterval: 30,
      notifyOnNetworkStatusChange: true,
    });

    let counter = 0;
    const handle = observable.subscribe({
      next(result) {
        counter += 1;

        if (counter === 1) {
          assert.equal(result.networkStatus, NetworkStatus.ready);
        } else if (counter === 2) {
          assert.equal(result.networkStatus, NetworkStatus.poll);
          handle.unsubscribe();
          done();
        }
      },
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

    const queryManager = mockQueryManager(
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

    // First, prime the store so that query diffing removes the query
    return queryManager.query({
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
    assert.throw(() => {
      assertWithObserver({
        done,
        observer: {
          next(result) {
            done(new Error('Returned a result when it should not have.'));
          },
        },
        query: gql`
          query {
            author {
              firstName
              lastName
            }
          }`,
        queryOptions: { pollInterval: 200, noFetch: true },
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

    const queryManager = mockQueryManager(
      {
        request: { query: primeQuery },
        result: { data: data1 },
      }
    );

    // First, prime the cache
    return queryManager.query({
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
    return assertMutationRoundtrip({
      mutation: gql`
        mutation makeListPrivate {
          makeListPrivate(id: "5")
        }`,
      data: { makeListPrivate: true },
    });
  });

  it('runs a mutation with variables', () => {
    return assertMutationRoundtrip({
      mutation: gql`
        mutation makeListPrivate($listId: ID!) {
          makeListPrivate(id: $listId)
        }`,
      variables: { listId: '1' },
      data: { makeListPrivate: true },
    });
  });

  it('runs a mutation with object parameters and puts the result in the store', () => {
    const data = {
      makeListPrivate: {
        id: '5',
        isPrivate: true,
      },
    };
    return mockMutation({
      mutation: gql`
        mutation makeListPrivate {
          makeListPrivate(input: {id: "5"}) {
            id,
            isPrivate,
          }
        }`,
      data,
      store: createApolloStore({
        config: { dataIdFromObject: getIdField },
      }),
    }).then(({ result, queryManager }) => {
      assert.deepEqual(result.data, data);

      // Make sure we updated the store with the new data
      assert.deepEqual(
        queryManager.store.getState()['apollo'].data['5'],
        { id: '5', isPrivate: true }
      );
    });
  });

  it('runs a mutation and puts the result in the store', () => {
    const data = {
      makeListPrivate: {
        id: '5',
        isPrivate: true,
      },
    };

    return mockMutation({
      mutation: gql`
        mutation makeListPrivate {
          makeListPrivate(id: "5") {
            id,
            isPrivate,
          }
        }`,
      data,
      store: createApolloStore({
        config: { dataIdFromObject: getIdField },
      }),
    }).then(({ result, queryManager }) => {
      assert.deepEqual(result.data, data);

      // Make sure we updated the store with the new data
      assert.deepEqual(
        queryManager.store.getState()['apollo'].data['5'],
        { id: '5', isPrivate: true }
      );
    });
  });

  it('runs a mutation and puts the result in the store with root key', () => {
    const  mutation = gql`
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

    const reduxRootKey = 'test';
    const reduxRootSelector = (state: any) => state[reduxRootKey];
    const store = createApolloStore({
      reduxRootKey,
      config: { dataIdFromObject: getIdField },
    });
    const queryManager = createQueryManager({
      networkInterface: mockNetworkInterface(
        {
          request: { query: mutation },
          result: { data },
        }
      ),
      store,
      reduxRootSelector,
    });

    return queryManager.mutate({
      mutation,
    }).then((result) => {
      assert.deepEqual(result.data, data);

      // Make sure we updated the store with the new data
      assert.deepEqual(reduxRootSelector(store.getState()).data['5'], { id: '5', isPrivate: true });
    });
  });

  it('does not broadcast queries when non-apollo actions are dispatched', () => {
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

    function testReducer (state = false, action: any): boolean {
      if (action.type === 'TOGGLE') {
        return true;
      }
      return state;
    }
    const client = new ApolloClient();
    const store = createStore(
      combineReducers({
        test: testReducer,
        apollo: client.reducer() as any, // XXX see why this type fails
      }),
      applyMiddleware(client.middleware())
    );
    const observable = createQueryManager({
      networkInterface: mockNetworkInterface(
        {
          request: { query, variables },
          result: { data: data1 },
        },
        {
          request: { query, variables },
          result: { data: data2 },
        }
      ),
      store: store,
    }).watchQuery({ query, variables });

    return observableToPromise({ observable },
      (result) => {
        assert.deepEqual(result.data, data1);
        observable.refetch();
      },
      (result) => {
        assert.deepEqual(result.data, data2);
        store.dispatch({
          type: 'TOGGLE',
        });
      }
    );
  });

  it(`doesn't return data while query is loading`, () => {
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

    const queryManager = mockQueryManager(
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

    const observable1 = queryManager.watchQuery({ query: query1 });
    const observable2 = queryManager.watchQuery({ query: query2 });

    return Promise.all([
      observableToPromise({ observable: observable1 },
        (result) => assert.deepEqual(result.data, data1)
      ),
      observableToPromise({ observable: observable2 },
        (result) => assert.deepEqual(result.data, data2)
      ),
    ]);
  });

  it(`updates result of previous query if the result of a new query overlaps`, () => {
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

    const queryManager = mockQueryManager(
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

    const observable = queryManager.watchQuery({ query: query1 });
    return observableToPromise({ observable },
      (result) => {
        assert.deepEqual(result.data, data1);
        queryManager.query({ query: query2 });
      },
      // 3 because the query init action for the second query causes a callback
      (result) => assert.deepEqual(result.data, {
        people_one: {
          name: 'Luke Skywalker has a new name',
          age: 50,
        },
      })
    );
  });

  describe('polling queries', () => {
    it('allows you to poll queries', () => {
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
      const queryManager = mockQueryManager(
        {
          request: { query, variables },
          result: { data: data1 },
        },
        {
          request: { query, variables },
          result: { data: data2 },
        }
      );
      const observable = queryManager.watchQuery({
        query,
        variables,
        pollInterval: 50,
      });

      return observableToPromise({ observable },
        (result) => assert.deepEqual(result.data, data1),
        (result) => assert.deepEqual(result.data, data2),
      );
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
      const queryManager = mockQueryManager(
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
      let handle1Count = 0;
      let handleCount = 0;
      let setMilestone = false;

      const subscription1 = queryManager.watchQuery({
        query: query1,
        pollInterval: 150,
      }).subscribe({
        next(result) {
          handle1Count++;
          handleCount++;
          if (handle1Count > 1 && !setMilestone) {
            subscription1.unsubscribe();
            setMilestone = true;
          }
        },
      });

      const subscription2 = queryManager.watchQuery({
        query: query2,
        pollInterval: 2000,
      }).subscribe({
        next(result) {
          handleCount++;
        },
      });

      setTimeout(() => {
        assert.equal(handleCount, 3);
        subscription1.unsubscribe();
        subscription2.unsubscribe();

        done();
      }, 400);
    });

    it('allows you to unsubscribe from polled queries', () => {
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

      const queryManager = mockQueryManager(
        {
          request: { query, variables },
          result: { data: data1 },
        },
        {
          request: { query, variables },
          result: { data: data2 },
        }
      );
      const observable = queryManager.watchQuery({
        query,
        variables,
        pollInterval: 50,
      });

      const { promise, subscription } = observableToPromiseAndSubscription({
          observable,
          wait: 60,
        },
        (result) => assert.deepEqual(result.data, data1),
        (result) => {
          assert.deepEqual(result.data, data2);

          // we unsubscribe here manually, rather than waiting for the timeout.
          subscription.unsubscribe();
        }
      );

      return promise;
    });

    it('allows you to unsubscribe from polled query errors', () => {
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

      const queryManager = mockQueryManager(
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

      const observable = queryManager.watchQuery({
        query,
        variables,
        pollInterval: 50,
      });

      const { promise, subscription } = observableToPromiseAndSubscription({
          observable,
          wait: 60,
          errorCallbacks: [
            (error) => {
              assert.include(error.message, 'Network error');
              subscription.unsubscribe();
            },
          ],
        },
        (result) => assert.deepEqual(result.data, data1)
      );

      return promise;
    });

    it('exposes a way to start a polling query', () => {
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

      const queryManager = mockQueryManager(
        {
          request: { query, variables },
          result: { data: data1 },
        },
        {
          request: { query, variables },
          result: { data: data2 },
        }
      );

      const observable = queryManager.watchQuery({ query, variables });
      observable.startPolling(50);

      return observableToPromise({ observable },
        (result) => assert.deepEqual(result.data, data1),
        (result) => assert.deepEqual(result.data, data2)
      );
    });

    it('exposes a way to stop a polling query', () => {
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

      const queryManager = mockQueryManager(
        {
          request: { query, variables },
          result: { data: data1 },
        },
        {
          request: { query, variables },
          result: { data: data2 },
        }
      );
      const observable = queryManager.watchQuery({
        query,
        variables,
        pollInterval: 50,
      });

      return observableToPromise({ observable, wait: 60},
        (result) => {
          assert.deepEqual(result.data, data1);
          observable.stopPolling();
        }
      );
    });

    it('stopped polling queries still get updates', () => {
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

      const queryManager = mockQueryManager(
        {
          request: { query, variables },
          result: { data: data1 },
        },
        {
          request: { query, variables },
          result: { data: data2 },
        }
      );
      const observable = queryManager.watchQuery({
        query,
        variables,
        pollInterval: 50,
      });

      let timeout: Function;
      return Promise.race([
        observableToPromise({ observable },
          (result) => {
            assert.deepEqual(result.data, data1);
            queryManager.query({ query, variables, forceFetch: true })
              .then(() => timeout(new Error('Should have two results by now')));
          },
          (result) => assert.deepEqual(result.data, data2)
        ),
        // Ensure that the observable has recieved 2 results *before*
        // the rejection triggered above
        new Promise((resolve, reject) => {
          timeout = (error: Error) => reject(error);
        }),
      ]);
    });
  });

  it('warns if you forget the template literal tag', () => {
    const queryManager = mockQueryManager();
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
    };

    //make sure that the query is transformed within the query
    //manager
    createQueryManager({
      networkInterface: mockNetworkInterface(
        {
          request: {query},
          result: {data: unmodifiedQueryResult},
        },
        {
          request: {query: transformedQuery},
          result: {data: transformedQueryResult},
        }
      ),
      addTypename: true,
    }).query({query: query}).then((result) => {
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
    };

    createQueryManager({
      networkInterface: mockNetworkInterface(
        {
          request: {query: mutation},
          result: {data: unmodifiedMutationResult},
        },
        {
          request: {query: transformedMutation},
          result: {data: transformedMutationResult},
        }),
      addTypename: true,
    }).mutate({mutation: mutation}).then((result) => {
      assert.deepEqual(result.data, transformedMutationResult);
      done();
    });
  });

  describe('store resets', () => {
    it('should change the store state to an empty state', () => {
      const queryManager = createQueryManager({});

      queryManager.resetStore();
      const currentState = queryManager.getApolloState();
      const expectedState: any = {
        data: {},
        mutations: {},
        queries: {},
        optimistic: [],
        reducerError: null,
      };

      assert.deepEqual(currentState, expectedState);
    });

    it('should only refetch once when we store reset', () => {
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
      const networkInterface: NetworkInterface = {
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
      queryManager = createQueryManager({ networkInterface });
      const observable = queryManager.watchQuery({ query });

      // wait just to make sure the observable doesn't fire again
      return observableToPromise({ observable, wait: 0 },
        (result) => assert.deepEqual(result.data, data)
      ).then(() => {
        assert.equal(timesFired, 2);
      });
    });

    it('should not error on queries that are already in the store', () => {
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
      const networkInterface: NetworkInterface = {
        query(request: Request): Promise<GraphQLResult> {
          if (timesFired === 0) {
            timesFired += 1;
            setTimeout(queryManager.resetStore.bind(queryManager), 10);
          } else {
            timesFired += 1;
          }
          return Promise.resolve({ data });
        },
      };
      queryManager = createQueryManager({ networkInterface });
      const observable = queryManager.watchQuery({ query });

      // wait to make sure store reset happened
      return observableToPromise({ observable, wait: 20 },
        result => assert.deepEqual(result.data, data),
      ).then(() => {
        assert.equal(timesFired, 2);
      });
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
      const queryManager = mockQueryManager({
        request: { query },
        result: { data },
        delay: 10000, //i.e. forever
      });
      queryManager.fetchQuery('made up id', { query }).then((result) => {
        done(new Error('Returned a result.'));
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
      const queryManager = mockQueryManager();
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
      const queryManager = createQueryManager({});
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
      const networkInterface: NetworkInterface = {
        query(request: Request): Promise<GraphQLResult> {
          // reset the store as soon as we hear about the query
          queryManager.resetStore();
          return Promise.resolve({ data });
        },
      };

      queryManager = createQueryManager({ networkInterface });
      queryManager.query({ query }).then((result) => {
        done(new Error('query() gave results on a store reset'));
      }).catch((error) => {
        done();
      });
    });
  });

  it('should reject a query promise given a network error', (done) => {
    const query = gql`
      query {
        author {
          firstName
          lastName
        }
      }`;
    const networkError = new Error('Network error');
    mockQueryManager({
      request: { query },
      error: networkError,
    }).query({ query }).then((result) => {
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
    const reducerConfig = { dataIdFromObject: (x: any) => '$' + dataIdFromObject(x) };
    const store = createApolloStore({ config: reducerConfig, reportCrashes: false });
    createQueryManager({
      networkInterface: mockNetworkInterface({
        request: { query },
        result: { data },
      }),
      store,
    }).query({ query }).then((result) => {
      done(new Error('Returned a result when it should not have.'));
    }).catch((error) => {
      done();
    });
  });

  it('should reject a query promise given a GraphQL error', () => {
    const query = gql`
      query {
        author {
          firstName
          lastName
        }
      }`;
    const graphQLErrors = [new Error('GraphQL error')];
    return mockQueryManager({
      request: { query },
      result: { errors: graphQLErrors },
    }).query({ query }).then(
      (result) => {
        throw new Error('Returned result on an errored fetchQuery');
      },
      // don't use .catch() for this or it will catch the above error
      (error) => {
        const apolloError = error as ApolloError;
        assert(apolloError.message);
        assert.equal(apolloError.graphQLErrors, graphQLErrors);
        assert(!apolloError.networkError);
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
    const queryManager = mockQueryManager(
      {
        request: { query },
        result: { data },
      },
      {
        request: { query },
        error: new Error('Network error ocurred'),
      }
    );
    queryManager.query({ query }).then((result) => {
      assert.deepEqual(result.data, data);

      queryManager.query({ query, forceFetch: true }).then(() => {
        done(new Error('Returned a result when it was not supposed to.'));
      }).catch((error) => {
        // make that the error thrown doesn't empty the state
        assert.deepEqual(queryManager.store.getState().apollo.data['$ROOT_QUERY.author'], data['author']);
        done();
      });
    }).catch((error) => {
      done(new Error('Threw an error on the first query.'));
    });
  });

  it('should be able to unsubscribe from a polling query subscription', () => {
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

    const observable = mockQueryManager({
      request: { query },
      result: { data },
    }).watchQuery({ query, pollInterval: 20 });

    const { promise, subscription } = observableToPromiseAndSubscription({
        observable,
        wait: 60,
      },
      (result: any) => {
        assert.deepEqual(result.data, data);
        subscription.unsubscribe();
      }
    );
    return promise;
  });

  it('should not empty the store when a polling query fails due to a network error', () => {
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
    const queryManager = mockQueryManager(
      {
        request: { query },
        result: { data },
      },
      {
        request: { query },
        error: new Error('Network error occurred.'),
      }
    );
    const observable = queryManager.watchQuery({ query, pollInterval: 20 });

    return observableToPromise({
        observable,
        errorCallbacks: [
          () => {
            assert.deepEqual(
              queryManager.store.getState().apollo.data['$ROOT_QUERY.author'],
              data.author
            );
          },
        ],
      },
      (result) => {
        assert.deepEqual(result.data, data);
        assert.deepEqual(
          queryManager.store.getState().apollo.data['$ROOT_QUERY.author'],
          data.author
        );
      }
    );
  });

  it('should not fire next on an observer if there is no change in the result', () => {
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
    const queryManager = mockQueryManager(
      {
        request: { query },
        result: { data },
      },

      {
        request: { query },
        result: { data },
      }
    );

    const observable = queryManager.watchQuery({ query });
    return Promise.all<any[] | void>([
      // we wait for a little bit to ensure the result of the second query
      // don't trigger another subscription event
      observableToPromise({ observable, wait: 100 },
        (result) => {
          assert.deepEqual(result.data, data);
        }
      ),
      queryManager.query({ query }).then((result) => {
        assert.deepEqual(result.data, data);
      }),
    ]);
  });

  it('should error when we orphan a real-id node in the store with a real-id node', () => {
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
        id: '197',
        __typename: 'Author',
      },
    };
    const reducerConfig = { dataIdFromObject };
    const store = createApolloStore({ config: reducerConfig, reportCrashes: false });
    const queryManager = createQueryManager({
      networkInterface: mockNetworkInterface(
        {
          request: { query: query1 },
          result: { data: data1 },
        },
        {
          request: { query: query2 },
          result: { data: data2 },
        }
      ),
      store,
    });

    const observable1 = queryManager.watchQuery({ query: query1 });
    const observable2 = queryManager.watchQuery({ query: query2 });

    // I'm not sure the waiting 60 here really is required, but the test used to do it
    return Promise.all([
      observableToPromise({
          observable: observable1,
          errorCallbacks: [
            // This isn't the best error message, but at least people will know they are missing
            // data in the store.
            (error: ApolloError) => assert.include(error.networkError.message, 'find field'),
          ],
          wait: 60,
        },
        (result) => assert.deepEqual(result.data, data1)
      ),
      observableToPromise({
          observable: observable2,
          wait: 60,
        },
        (result) => assert.deepEqual(result.data, data2)
      ),
    ]);
  });


  it('should error if we replace a real id node in the store with a generated id node', () => {
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
    const reducerConfig = { dataIdFromObject };
    const store = createApolloStore({ config: reducerConfig, reportCrashes: false });
    const queryManager = createQueryManager({
      networkInterface: mockNetworkInterface(
        {
          request: { query: queryWithId },
          result: { data: dataWithId },
        },
        {
          request: { query: queryWithoutId },
          result: { data: dataWithoutId },
        }
      ),
      store,
    });

    const observableWithId = queryManager.watchQuery({ query: queryWithId });
    const observableWithoutId = queryManager.watchQuery({ query: queryWithoutId });

    // I'm not sure the waiting 60 here really is required, but the test used to do it
    return Promise.all([
      observableToPromise({ observable: observableWithId, wait: 60 },
        (result) => assert.deepEqual(result.data, dataWithId)
      ),
      observableToPromise({
          observable: observableWithoutId,
          errorCallbacks: [
            (error) => assert.include(error.message, 'Store error'),
            // The error gets triggered a second time when we unsubscribe the
            // the first promise, as there is no duplicate prevention for errors
            (error) => assert.include(error.message, 'Store error'),
          ],
          wait: 60,
        }
      ),
    ]);
  });

  it('should not error when merging a generated id store node  with a real id node', () => {
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
    const mergedDataWithoutId = {
      author: {
        name: {
          firstName: 'Jane',
          lastName: 'Smith',
        },
        age: '124',
        __typename: 'Author',
      },
    };
    const store = createApolloStore({ config: { dataIdFromObject } });
    const queryManager = createQueryManager({
      networkInterface:  mockNetworkInterface(
        {
          request: { query: queryWithoutId },
          result: { data: dataWithoutId },
        },
        {
          request: { query: queryWithId },
          result: { data: dataWithId },
        }
      ),
      store,
    });

    const observableWithId = queryManager.watchQuery({ query: queryWithId });
    const observableWithoutId = queryManager.watchQuery({ query: queryWithoutId });

    // I'm not sure the waiting 60 here really is required, but the test used to do it
    return Promise.all([
      observableToPromise({ observable: observableWithoutId, wait: 120 },
        (result) => assert.deepEqual(result.data, dataWithoutId),
        (result) => assert.deepEqual(result.data, mergedDataWithoutId)
      ),
      observableToPromise({ observable: observableWithId, wait: 120 },
        (result) => assert.deepEqual(result.data, dataWithId)
      ),
    ]);
  });

  describe('loading state', () => {
    it('should be passed as false if we are not watching a query', () => {
      const query = gql`
        query {
          fortuneCookie
        }`;
      const data = {
        fortuneCookie: 'Buy it',
      };
      return  mockQueryManager({
        request: { query },
        result: { data },
      }).query({ query }).then((result) => {
        assert(!result.loading);
        assert.deepEqual(result.data, data);
      });
    });

    it('should be passed to the observer as true if we are returning partial data', () => {
      const fortuneCookie = 'You must stick to your goal but rethink your approach';
      const primeQuery = gql`
        query {
          fortuneCookie
        }`;
      const primeData = { fortuneCookie };

      const author = { name: 'John' };
      const query = gql`
        query {
          fortuneCookie
          author {
            name
          }
        }`;
      const fullData = { fortuneCookie, author };

      const queryManager = mockQueryManager(
        {
          request: { query },
          result: { data: fullData },
          delay: 5,
        },
        {
          request: { query: primeQuery },
          result: { data: primeData },
        }
      );

      return queryManager.query({ query: primeQuery }).then((primeResult) => {
        const observable = queryManager.watchQuery({ query, returnPartialData: true });

        return observableToPromise({ observable },
          (result) => {
            assert(result.loading);
            assert.deepEqual(result.data, primeData);
          },
          (result) => {
            assert(!result.loading);
            assert.deepEqual(result.data, fullData);
          }
        );
      });
    });

    it('should be passed to the observer as false if we are returning all the data', (done) => {
      assertWithObserver({
        done,
        query: gql`
          query {
            author {
              firstName
              lastName
            }
          }`,
        result: {
          data: {
            author: {
              firstName: 'John',
              lastName: 'Smith',
            },
          },
        },
        observer: {
          next(result) {
            assert(!result.loading);
            done();
          },
        },
      });
    });
  });

  describe('refetchQueries', () => {
    const oldWarn = console.warn;
    let warned: any;
    let timesWarned = 0;

    beforeEach((done) => {
      // clear warnings
      warned = null;
      timesWarned = 0;
      // mock warn method
      console.warn = (...args: any[]) => {
        warned = args;
        timesWarned++;
      };
      done();
    });

    it('should refetch the right query when a result is successfully returned', () => {
      const mutation = gql`
        mutation changeAuthorName {
          changeAuthorName(newName: "Jack Smith") {
            firstName
            lastName
          }
        }`;
      const mutationData = {
        changeAuthorName: {
          firstName: 'Jack',
          lastName: 'Smith',
        },
      };
      const query = gql`
        query getAuthors {
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
      const secondReqData = {
        author: {
          firstName: 'Jane',
          lastName: 'Johnson',
        },
      };
      const queryManager = mockQueryManager(
        {
          request: { query },
          result: { data },
        },
        {
          request: { query },
          result: { data: secondReqData },
        },
        {
          request: { query: mutation },
          result: { data: mutationData },
        }
      );
      const observable = queryManager.watchQuery({ query });
      return observableToPromise({ observable },
        (result) => {
          assert.deepEqual(result.data, data);
          queryManager.mutate({ mutation, refetchQueries: ['getAuthors'] });
        },
        (result) => assert.deepEqual(result.data, secondReqData)
      );
    });

    it('should warn but continue when an unknown query name is asked to refetch', () => {
      const mutation = gql`
        mutation changeAuthorName {
          changeAuthorName(newName: "Jack Smith") {
            firstName
            lastName
          }
        }`;
      const mutationData = {
        changeAuthorName: {
          firstName: 'Jack',
          lastName: 'Smith',
        },
      };
      const query = gql`
        query getAuthors {
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
      const secondReqData = {
        author: {
          firstName: 'Jane',
          lastName: 'Johnson',
        },
      };
      const queryManager = mockQueryManager(
        {
          request: { query },
          result: { data },
        },
        {
          request: { query },
          result: { data: secondReqData },
        },
        {
          request: { query: mutation },
          result: { data: mutationData },
        }
      );
      const observable = queryManager.watchQuery({ query });
      return observableToPromise({ observable },
        (result) => {
          assert.deepEqual(result.data, data);
          queryManager.mutate({ mutation, refetchQueries: ['fakeQuery', 'getAuthors'] });
        },
        (result) => {
          assert.deepEqual(result.data, secondReqData);
          assert.include(warned[0], 'Warning: unknown query with name fakeQuery');
          assert.equal(timesWarned, 1);
        }
      );
    });

    it('should ignore without warning a query name that is asked to refetch with no active subscriptions', () => {
      const mutation = gql`
        mutation changeAuthorName {
          changeAuthorName(newName: "Jack Smith") {
            firstName
            lastName
          }
        }`;
      const mutationData = {
        changeAuthorName: {
          firstName: 'Jack',
          lastName: 'Smith',
        },
      };
      const query = gql`
        query getAuthors {
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
      const secondReqData = {
        author: {
          firstName: 'Jane',
          lastName: 'Johnson',
        },
      };
      const queryManager = mockQueryManager(
        {
          request: { query },
          result: { data },
        },
        {
          request: { query },
          result: { data: secondReqData },
        },
        {
          request: { query: mutation },
          result: { data: mutationData },
        }
      );

      const observable = queryManager.watchQuery({ query });
      return observableToPromise({ observable },
        (result) => {
          assert.deepEqual(result.data, data);
        }
      ).then(() => {
        // The subscription has been stopped already
        return queryManager.mutate({ mutation, refetchQueries: ['getAuthors'] });
      })
      .then(() => assert.equal(timesWarned, 0));
    });

    afterEach((done) => {
      // restore standard method
      console.warn = oldWarn;
      done();
    });
  });

  describe('result transformation', () => {

    let client: ApolloClient;
    let response: any;
    let transformCount: number;

    beforeEach(() => {
      transformCount = 0;

      const networkInterface: NetworkInterface = {
        query(request: Request): Promise<GraphQLResult> {
          return Promise.resolve(response);
        },
      };

      client = new ApolloClient({
        networkInterface,
        resultTransformer(result: GraphQLResult) {
          transformCount++;
          return {
            data: assign({}, result.data, {transformCount}),
            loading: false,
            networkStatus: NetworkStatus.ready,
          };
        },
      });
    });

    it('transforms query() results', () => {
      response = {data: {foo: 123}};
      return client.query({query: gql`{ foo }`})
        .then((result: ApolloQueryResult) => {
          assert.deepEqual(result.data, {foo: 123, transformCount: 1});
        });
    });

    it('transforms watchQuery() results', () => {
      response = {data: {foo: 123}};
      const observable = client.watchQuery({query: gql`{ foo }`});

      return observableToPromise({ observable },
        (result) => {
          assert.deepEqual(result.data, {foo: 123, transformCount: 1});
          response = {data: {foo: 456}};
          observable.refetch();
        },
        (result) => assert.deepEqual(result.data, {foo: 456, transformCount: 2})
      );
    });

    it('does not transform identical watchQuery() results', () => {
      response = {data: {foo: 123}};
      const observable = client.watchQuery({query: gql`{ foo }`});

      let succeed: Function;
      return Promise.race([
        // This will never resolve but *will* fail if we see the wrong number
        // of callbacks
        observableToPromise({ observable, shouldResolve: false },
          (result) => {
            assert.deepEqual(result.data, { foo: 123, transformCount: 1 });
            // If a callback triggers before the then, we'll get a test failure
            observable.refetch().then(() => succeed());
          }
        ),
        new Promise((resolve) => succeed = resolve),
      ]);
    });

    it('transforms mutate() results', () => {
      response = {data: {foo: 123}};
      return client.mutate({mutation: gql`mutation makeChanges { foo }`})
        .then((result: ApolloQueryResult) => {
          assert.deepEqual(result.data, {foo: 123, transformCount: 1});
        });
    });

  });

  describe('result transformation with custom equality', () => {

    class Model {}

    let client: ApolloClient;
    let response: any;

    beforeEach(() => {
      const networkInterface: NetworkInterface = {
        query(request: Request): Promise<GraphQLResult> {
          return Promise.resolve(response);
        },
      };

      client = new ApolloClient({
        networkInterface,
        resultTransformer(result: ApolloQueryResult) {
          result.data.__proto__ = Model.prototype;
          return result;
        },
        resultComparator(result1: ApolloQueryResult, result2: ApolloQueryResult) {
          // A real example would, say, deep compare the two while ignoring prototypes.
          const foo1 = result1 && result1.data && result1.data.foo;
          const foo2 = result2 && result2.data && result2.data.foo;
          return foo1 === foo2;
        },
      });
    });

    it('does not transform identical watchQuery() results, according to the comparator', () => {
      response = {data: {foo: 123}};
      const observable = client.watchQuery({query: gql`{ foo }`});


      let succeed: Function;
      return Promise.race([
        // This will never resolve but *will* fail if we see the wrong number
        // of callbacks
        observableToPromise({ observable, shouldResolve: false },
          (result) => {
            assert.instanceOf(result.data, Model);
            response = {data: {foo: 123}}; // Ensure we have new response objects.
            // If a callback triggers before the then, we'll get a test failure
            observable.refetch().then(() => succeed());
          }
        ),
        new Promise((resolve) => succeed = resolve),
      ]);
    });

  });

  it('exposes errors on a refetch as a rejection', (done) => {
    const request = {
      query: gql`
      {
        people_one(id: 1) {
          name
        }
      }`,
    };
    const firstResult = {
      data: {
        people_one: {
          name: 'Luke Skywalker',
        },
      },
    };
    const secondResult = {
      errors: [
        {
          name: 'PeopleError',
          message: 'This is not the person you are looking for.',
        },
      ],
    };

    const queryManager = mockRefetch({ request, firstResult, secondResult });

    const handle = queryManager.watchQuery(request);

    handle.subscribe({
      error: () => { /* nothing */ },
    });

    handle.refetch().catch((error) => {
      assert.deepEqual(error.graphQLErrors, [
        {
          name: 'PeopleError',
          message: 'This is not the person you are looking for.',
        },
      ]);
      done();
    });

    // We have an unhandled error warning from the `subscribe` above, which has no `error` cb
  });
});

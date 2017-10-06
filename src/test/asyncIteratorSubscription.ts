// chai style expect().to.be.true  violates no-unused-expression
/* tslint:disable:no-unused-expression */
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { spy } from 'sinon';
import * as sinonChai from 'sinon-chai';

import { isAsyncIterable } from 'iterall';
import { PubSub } from '../pubsub';
import { withFilter } from '../with-filter';
import { ExecutionResult } from 'graphql';

chai.use(chaiAsPromised);
chai.use(sinonChai);
const expect = chai.expect;

import {
  parse,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';

import { subscribe } from 'graphql/subscription';

const FIRST_EVENT = 'FIRST_EVENT';

const defaultFilter = (payload) => true;

function buildSchema(iterator, filterFn = defaultFilter) {
  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
        testString: {
          type: GraphQLString,
          resolve: function(_, args) {
            return 'works';
          },
        },
      },
    }),
    subscription: new GraphQLObjectType({
      name: 'Subscription',
      fields: {
        testSubscription: {
          type: GraphQLString,
          subscribe: withFilter(() => iterator, filterFn),
          resolve: root => {
            return 'FIRST_EVENT';
          },
        },
      },
    }),
  });
}

describe('GraphQL-JS asyncIterator', () => {
  it('should allow subscriptions', async () => {
    const query = parse(`
      subscription S1 {

        testSubscription
      }
    `);
    const pubsub = new PubSub();
    const origIterator = pubsub.asyncIterator(FIRST_EVENT);
    const schema = buildSchema(origIterator);


    const results = await subscribe(schema, query) as AsyncIterator<ExecutionResult>;
    const payload1 = results.next();

    expect(isAsyncIterable(results)).to.be.true;

    const r = payload1.then(res => {
      expect(res.value.data.testSubscription).to.equal('FIRST_EVENT');
    });

    pubsub.publish(FIRST_EVENT, {});

    return r;
  });

  it('should detect when the payload is done when filtering', (done) => {
    const query = parse(`
      subscription S1 {
        testSubscription
      }
    `);

    const pubsub = new PubSub();
    const origIterator = pubsub.asyncIterator(FIRST_EVENT);

    let counter = 0;

    const filterFn = () => {
      counter++;

      if (counter > 10) {
        const e = new Error('Infinite loop detected');
        done(e);
        throw e;
      }

      return false;
    };

    const schema = buildSchema(origIterator, filterFn);

    Promise.resolve(subscribe(schema, query)).then((results: AsyncIterator<ExecutionResult>) => {
      expect(isAsyncIterable(results)).to.be.true;

      results.next();
      results.return();

      pubsub.publish(FIRST_EVENT, {});

      setTimeout(_ => {
        done();
      }, 500);
    });
  });

  it('should clear event handlers', async () => {
    const query = parse(`
      subscription S1 {
        testSubscription
      }
    `);

    const pubsub = new PubSub();
    const origIterator = pubsub.asyncIterator(FIRST_EVENT);
    const returnSpy = spy(origIterator, 'return');
    const schema = buildSchema(origIterator);

    const results = await subscribe(schema, query) as AsyncIterator<ExecutionResult>;
    const end = results.return();

    const r = end.then(res => {
      expect(returnSpy).to.have.been.called;
    });

    pubsub.publish(FIRST_EVENT, {});

    return r;
  });
});
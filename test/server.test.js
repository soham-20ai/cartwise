const assert = require('node:assert/strict');
const {after, before, test} = require('node:test');
const {createApp} = require('../server');
const products = require('../catalogue');

let server;
let baseUrl;

async function startServer(options) {
  const app = createApp(options);
  const instance = app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject) => {
    instance.once('listening',resolve);
    instance.once('error',reject);
  });
  return {
    instance,
    baseUrl:`http://127.0.0.1:${instance.address().port}`
  };
}

function requestContext() {
  return {
    products:products.map((product) => product.id),
    cart:[{id:1,quantity:2}],
    selectedStore:{name:'Quest Mall',address:'Kolkata',latitude:22.5395,longitude:88.3658},
    nearbyStores:[{
      name:'Quest Mall',
      address:'Kolkata',
      category:'Shopping Mall',
      distanceKm:3.7,
      latitude:22.5395,
      longitude:88.3658
    }],
    selectedCategory:'All',
    currency:'INR',
    latitude:22.5726,
    longitude:88.3639
  };
}

function chatPayload(overrides = {}) {
  return {
    message:'Suggest a breakfast under ₹500.',
    context:requestContext(),
    conversation:[],
    ...overrides
  };
}

async function postChat(payload, headers = {'Content-Type':'application/json'}) {
  return fetch(`${baseUrl}/api/chat`,{
    method:'POST',
    headers,
    body:typeof payload === 'string' ? payload : JSON.stringify(payload)
  });
}

before(async () => {
  ({instance:server,baseUrl} = await startServer({apiKey:''}));
});

after(async () => {
  if (server) await new Promise((resolve,reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('serves a health status without revealing credentials',async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{status:'ok',assistantConfigured:false});
});

test('reports missing API configuration rather than generating a pretend response',async () => {
  const response = await postChat(chatPayload());
  assert.equal(response.status,503);
  const result = await response.json();
  assert.equal(result.ok,false);
  assert.equal(result.code,'not_configured');
  assert.match(result.error,/OPENAI_API_KEY/);
  assert.equal(JSON.stringify(result).includes('test-key'),false);
});

test('treats the example API-key placeholder as unconfigured',async (t) => {
  const placeholderServer = await startServer({apiKey:'your_openai_api_key_here'});
  t.after(() => new Promise((resolve,reject) => placeholderServer.instance.close((error) => error ? reject(error) : resolve())));
  const response = await fetch(`${placeholderServer.baseUrl}/api/health`);
  assert.deepEqual(await response.json(),{status:'ok',assistantConfigured:false});
});

test('rejects empty, overlong, and malformed requests',async (t) => {
  await t.test('empty message',async () => {
    const response = await postChat(chatPayload({message:'   '}));
    assert.equal(response.status,400);
    const result = await response.json();
    assert.equal(result.ok,false);
    assert.equal(result.code,'invalid_request');
  });
  await t.test('overlong message',async () => {
    const response = await postChat(chatPayload({message:'x'.repeat(1201)}));
    assert.equal(response.status,400);
  });
  await t.test('unknown product id',async () => {
    const context = requestContext();
    context.products.push(999);
    const response = await postChat(chatPayload({context}));
    assert.equal(response.status,400);
  });
  await t.test('malformed JSON',async () => {
    const response = await postChat('{"message":',{'Content-Type':'application/json'});
    assert.equal(response.status,400);
    assert.equal((await response.json()).code,'invalid_json');
  });
});

test('sends only canonical product data and coordinate-free shopping context to the model',async (t) => {
  let capturedRequest;
  const modelServer = await startServer({
    apiKey:'test-key',
    openAIClientFactory:() => ({
      chat:{completions:{create:async (request) => {
        capturedRequest = request;
        return {
          choices:[{message:{content:JSON.stringify({
            reply:'Try the existing Cartwise breakfast picks.',
            recommendedProducts:[
              {productId:1,reason:'A catalogue product.'},
              {productId:999,reason:'This product does not exist.'},
              {productId:1,reason:'Duplicate entry.'}
            ]
          })}}]
        };
      }}}
    })
  });
  t.after(() => new Promise((resolve,reject) => modelServer.instance.close((error) => error ? reject(error) : resolve())));

  const response = await fetch(`${modelServer.baseUrl}/api/chat`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(chatPayload())
  });
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{
    ok:true,
    message:'Try the existing Cartwise breakfast picks.',
    recommendations:[{productId:1,reason:'A catalogue product.'}]
  });
  const modelMessages = JSON.stringify(capturedRequest.messages);
  const trustedContext = capturedRequest.messages[0].content;
  assert.equal(modelMessages.includes('22.5726'),false);
  assert.equal(modelMessages.includes('22.5395'),false);
  assert.equal(modelMessages.includes('88.3639'),false);
  assert.equal(modelMessages.includes('"price":3.49'),false);
  assert.match(trustedContext,/Organic avocados/);
  assert.match(trustedContext,/"cartSubtotalInr":580\.04/);
  assert.match(trustedContext,/"cartEstimatedTaxInr":46\.4/);
  assert.match(trustedContext,/"cartTotalInr":626\.44/);
  const backendSource = await fetch(`${modelServer.baseUrl}/server.js`);
  assert.equal(backendSource.status,404);
});

test('returns a friendly error when the model is rate limited',async (t) => {
  const modelServer = await startServer({
    apiKey:'test-key',
    openAIClientFactory:() => ({
      chat:{completions:{create:async () => {
        const error = new Error('Internal provider response must not be exposed.');
        error.status = 429;
        throw error;
      }}}
    })
  });
  t.after(() => new Promise((resolve,reject) => modelServer.instance.close((error) => error ? reject(error) : resolve())));

  const response = await fetch(`${modelServer.baseUrl}/api/chat`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(chatPayload())
  });
  assert.equal(response.status,429);
  const result = await response.json();
  assert.equal(result.ok,false);
  assert.equal(result.code,'upstream_rate_limited');
  assert.equal(JSON.stringify(result).includes('Internal provider response'),false);
});

test('converts an invalid OpenAI key to a clear safe error response',async (t) => {
  const modelServer = await startServer({
    apiKey:'test-key',
    openAIClientFactory:() => ({
      chat:{completions:{create:async () => {
        const error = new Error('Do not forward raw provider messages.');
        error.status = 401;
        error.type = 'invalid_request_error';
        error.code = 'invalid_api_key';
        throw error;
      }}}
    })
  });
  t.after(() => new Promise((resolve,reject) => modelServer.instance.close((error) => error ? reject(error) : resolve())));

  const response = await fetch(`${modelServer.baseUrl}/api/chat`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(chatPayload({message:'What is the cheapest product in the Cartwise catalogue?'}))
  });
  assert.equal(response.status,502);
  const result = await response.json();
  assert.deepEqual(
    {ok:result.ok,code:result.code},
    {ok:false,code:'authentication_failed'}
  );
  assert.match(result.error,/could not authenticate/i);
  assert.equal(JSON.stringify(result).includes('Do not forward raw provider messages.'),false);
});

test('distinguishes OpenAI quota, model and malformed-response failures safely',async (t) => {
  await t.test('insufficient quota',async () => {
    const quotaServer = await startServer({
      apiKey:'test-key',
      openAIClientFactory:() => ({
        chat:{completions:{create:async () => {
          const error = new Error('Provider quota detail must remain private.');
          error.status = 429;
          error.code = 'insufficient_quota';
          throw error;
        }}}
      })
    });
    t.after(() => new Promise((resolve,reject) => quotaServer.instance.close((error) => error ? reject(error) : resolve())));
    const response = await fetch(`${quotaServer.baseUrl}/api/chat`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(chatPayload())
    });
    const result = await response.json();
    assert.equal(response.status,503);
    assert.equal(result.ok,false);
    assert.equal(result.code,'insufficient_quota');
    assert.match(result.error,/billing|quota/i);
    assert.equal(JSON.stringify(result).includes('Provider quota detail'),false);
  });

  await t.test('unavailable model',async () => {
    const modelServer = await startServer({
      apiKey:'test-key',
      openAIClientFactory:() => ({
        chat:{completions:{create:async () => {
          const error = new Error('Private provider response.');
          error.status = 404;
          error.code = 'model_not_found';
          throw error;
        }}}
      })
    });
    t.after(() => new Promise((resolve,reject) => modelServer.instance.close((error) => error ? reject(error) : resolve())));
    const response = await fetch(`${modelServer.baseUrl}/api/chat`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(chatPayload())
    });
    const result = await response.json();
    assert.equal(result.ok,false);
    assert.equal(result.code,'model_unavailable');
  });

  await t.test('invalid model response',async () => {
    const responseServer = await startServer({
      apiKey:'test-key',
      openAIClientFactory:() => ({
        chat:{completions:{create:async () => ({choices:[]})}}
      })
    });
    t.after(() => new Promise((resolve,reject) => responseServer.instance.close((error) => error ? reject(error) : resolve())));
    const response = await fetch(`${responseServer.baseUrl}/api/chat`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(chatPayload())
    });
    const result = await response.json();
    assert.equal(result.ok,false);
    assert.equal(result.code,'invalid_model_response');
  });
});

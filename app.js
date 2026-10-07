const products = window.CARTWISE_PRODUCTS;
const storeDirectory = [
  {id:'quest-mall',name:'Quest Mall',address:'Syed Amir Ali Avenue, Kolkata',latitude:22.5395,longitude:88.3658,category:'Shopping Mall'},
  {id:'south-city-mall',name:'South City Mall',address:'Prince Anwar Shah Road, Kolkata',latitude:22.5014,longitude:88.3617,category:'Shopping Mall'},
  {id:'acropolis-mall',name:'Acropolis Mall',address:'Rajdanga Main Road, Kolkata',latitude:22.5147,longitude:88.3933,category:'Shopping Mall'},
  {id:'manisquare-mall',name:'Mani Square',address:'EM Bypass, Kankurgachi, Kolkata',latitude:22.5777,longitude:88.4003,category:'Shopping Mall'},
  {id:'city-centre-salt-lake',name:'City Centre Salt Lake',address:'Bidhannagar, Kolkata',latitude:22.5867,longitude:88.4082,category:'Shopping Mall'},
  {id:'forum-courtyard',name:'Forum Courtyard',address:'Elgin Road, Kolkata',latitude:22.5380,longitude:88.3515,category:'Shopping Mall'},
  {id:'axis-mall',name:'Axis Mall',address:'New Town, Kolkata',latitude:22.5797,longitude:88.4592,category:'Shopping Mall'},
  {id:'city-centre-new-town',name:'City Centre New Town',address:'Action Area II, New Town',latitude:22.5806,longitude:88.4590,category:'Shopping Mall'}
];
const recommendations = {1:[2,5],2:[3,1],3:[2,4],4:[5,8],5:[8,1],6:[1,2],7:[4,1],8:[5,1]};
let cart = load('cartwise-cart', {});
let orders = load('cartwise-orders', []);
let currentCategory = 'All';
let visibleProducts = products;
let obstacleActive = false;
let locationRequestInProgress = false;
let nearbyStoreResults = [];
let chatConversation = [];
let chatBusy = false;
let toastTimer;
const $ = (selector) => document.querySelector(selector);
const demoCoordinates = {latitude:22.5726,longitude:88.3639};
const maxNearbyDistanceKm = 50;
const savedStoreId = load('cartwise-selected-store', null);
let selectedStore = storeDirectory.find((store) => store.id === savedStoreId) || null;
const currencyRates = {USD:1, EUR:0.92, GBP:0.79, INR:83.1, CAD:1.36};
let currency = load('cartwise-currency', 'USD');
if (!Object.hasOwn(currencyRates, currency)) currency = 'USD';
const money = (n, code = currency) => new Intl.NumberFormat(undefined, {
  style:'currency',
  currency:code,
  minimumFractionDigits:2,
  maximumFractionDigits:2
}).format(n * currencyRates[code]);
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save() { localStorage.setItem('cartwise-cart', JSON.stringify(cart)); localStorage.setItem('cartwise-orders', JSON.stringify(orders)); }
function product(id) { return products.find((item) => item.id === Number(id)); }
function isValidCoordinates(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90
    && longitude >= -180 && longitude <= 180;
}
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!isValidCoordinates(lat1, lon1) || !isValidCoordinates(lat2, lon2)) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(lat2 - lat1);
  const longitudeDelta = radians(lon2 - lon1);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(longitudeDelta / 2) ** 2;
  const centralAngle = 2 * Math.atan2(Math.sqrt(Math.min(1, Math.max(0, haversine))), Math.sqrt(Math.max(0, 1 - Math.min(1, Math.max(0, haversine)))));
  const distance = 6371 * centralAngle;
  return Number.isFinite(distance) ? distance : null;
}
function formatDistance(distanceKm) {
  return distanceKm < 1
    ? `${Math.round(distanceKm * 1000)} m away`
    : `${distanceKm.toFixed(1)} km away`;
}
function getNearbyStores(userLatitude, userLongitude) {
  if (!isValidCoordinates(userLatitude, userLongitude)) return [];
  return storeDirectory
    .filter((store) => store
      && typeof store.id === 'string'
      && typeof store.name === 'string'
      && typeof store.address === 'string'
      && typeof store.category === 'string'
      && isValidCoordinates(store.latitude, store.longitude))
    .map((store) => ({...store,distance:calculateDistance(userLatitude,userLongitude,store.latitude,store.longitude)}))
    .filter((store) => Number.isFinite(store.distance) && store.distance <= maxNearbyDistanceKm)
    .sort((a,b) => a.distance - b.distance)
    .slice(0,5);
}
function setLocationStatus(message, state = '') {
  const status = $('#locationStatus');
  status.textContent = message;
  status.dataset.state = state;
  status.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
}
function setActiveStore(store) {
  selectedStore = store;
  $('#activeStoreName').textContent = store ? store.name : 'Greenway Market';
  $('#activeStoreAddress').textContent = store ? store.address : '';
  $('#breadcrumbStore').textContent = store ? store.name : 'Greenway Market';
  try {
    if (store) localStorage.setItem('cartwise-selected-store', JSON.stringify(store.id));
    else localStorage.removeItem('cartwise-selected-store');
  } catch {
    showToast('Store selected, but this browser could not save it for next time.');
  }
  renderNearbyStores(nearbyStoreResults);
}
function renderNearbyStores(stores) {
  const container = $('#nearbyStores');
  if (!stores.length) {
    container.replaceChildren();
    return;
  }
  container.innerHTML = `<h3 class="nearby-heading">Nearby stores <span>${stores.length}</span></h3>${stores.map((store) => {
    const isSelected = selectedStore && store.id === selectedStore.id;
    return `<article class="nearby-store${isSelected ? ' selected' : ''}">
      <div class="nearby-store-top"><strong>${store.name}</strong><span class="nearby-distance">${formatDistance(store.distance)}</span></div>
      <p>${store.address}</p><small>${store.category}</small>
      <button class="nearby-select" type="button" data-select-store="${store.id}" ${isSelected ? 'disabled aria-pressed="true"' : 'aria-pressed="false"'}>${isSelected ? 'Selected' : 'Select store'}</button>
    </article>`;
  }).join('')}`;
}
function handleLocationSuccess(position) {
  locationRequestInProgress = false;
  $('#detectLocationBtn').disabled = false;
  $('#detectLocationBtn').classList.remove('loading');
  const latitude = position && position.coords && position.coords.latitude;
  const longitude = position && position.coords && position.coords.longitude;
  if (!isValidCoordinates(latitude, longitude)) {
    nearbyStoreResults = [];
    renderNearbyStores(nearbyStoreResults);
    setLocationStatus("We couldn't determine your location. Please try again.", 'error');
    $('#detectLocationBtn').textContent = 'Try again';
    return;
  }
  nearbyStoreResults = getNearbyStores(latitude, longitude);
  renderNearbyStores(nearbyStoreResults);
  if (nearbyStoreResults.length) {
    setLocationStatus('Showing the nearest stores. Your location is not saved.', 'success');
  } else {
    setLocationStatus('No stores found nearby. Try again or use the demo location.', 'error');
    $('#detectLocationBtn').textContent = 'Try again';
  }
  if (nearbyStoreResults.length) $('#detectLocationBtn').textContent = 'Refresh nearby stores';
}
function handleLocationError(error) {
  locationRequestInProgress = false;
  $('#detectLocationBtn').disabled = false;
  $('#detectLocationBtn').classList.remove('loading');
  nearbyStoreResults = [];
  renderNearbyStores(nearbyStoreResults);
  const messages = {
    1:'Location access was denied. Allow location access in your browser and try again.',
    2:"We couldn't determine your location. Check your device's location settings and try again.",
    3:'Location detection timed out. Please try again.'
  };
  setLocationStatus(messages[error && error.code] || "We couldn't determine your location. Please try again.", 'error');
  $('#detectLocationBtn').textContent = 'Try again';
}
function requestUserLocation() {
  if (locationRequestInProgress) return;
  const geolocation = window.navigator && window.navigator.geolocation;
  if (!geolocation) {
    setLocationStatus('Your browser does not support location detection. You can use the demo location instead.', 'error');
    $('#detectLocationBtn').textContent = 'Try again';
    return;
  }
  const localHost = ['localhost','127.0.0.1','[::1]'].includes(window.location.hostname);
  if (!window.isSecureContext && !localHost) {
    setLocationStatus('Location detection requires HTTPS or localhost. Start a local development server, or use the demo location.', 'error');
    $('#detectLocationBtn').textContent = 'Try again';
    return;
  }
  locationRequestInProgress = true;
  $('#detectLocationBtn').disabled = true;
  $('#demoLocationBtn').disabled = true;
  $('#detectLocationBtn').classList.add('loading');
  $('#locationStatus').setAttribute('aria-busy', 'true');
  $('#detectLocationBtn').innerHTML = '<span class="location-spinner" aria-hidden="true"></span> Detecting your location...';
  setLocationStatus('Detecting your location...', 'loading');
  try {
    geolocation.getCurrentPosition(
      (position) => {
        $('#demoLocationBtn').disabled = false;
        handleLocationSuccess(position);
      },
      (error) => {
        $('#demoLocationBtn').disabled = false;
        handleLocationError(error);
      },
      {enableHighAccuracy:false,timeout:12000,maximumAge:300000}
    );
  } catch {
    $('#demoLocationBtn').disabled = false;
    handleLocationError(null);
  }
}
function useDemoLocation() {
  if (locationRequestInProgress) return;
  nearbyStoreResults = getNearbyStores(demoCoordinates.latitude, demoCoordinates.longitude);
  renderNearbyStores(nearbyStoreResults);
  setLocationStatus('Demo location: central Kolkata. This is not your live location.', 'demo');
  $('#detectLocationBtn').textContent = 'Detect my location';
}
function selectStore(storeId) {
  const store = storeDirectory.find((entry) => entry.id === storeId);
  if (!store) return;
  setActiveStore(store);
  showToast(`${store.name} is now your shopping location.`);
}

function renderProducts(list = products) {
  visibleProducts = list;
  $('#productGrid').innerHTML = list.length ? list.map((item) => `<article class="product-card">
    <div class="product-image" style="background:${item.color}">${item.badge ? `<span class="product-badge">${item.badge}</span>` : ''}<button class="favorite" aria-label="Save ${item.name}" data-favorite="${item.id}">♡</button><span class="product-emoji" aria-hidden="true">${item.emoji}</span></div>
    <div class="product-info"><div class="product-category">${item.category}</div><div class="product-name">${item.name}</div><div class="product-detail">${item.detail}</div><div class="product-buy"><div class="product-price">${money(item.price)} <small>/ item</small></div><button class="add-button" aria-label="Add ${item.name} to cart" data-add="${item.id}">+</button></div></div>
    </article>`).join('') : '<p class="no-results">No products in this category yet.</p>';
}

function renderCart() {
  const entries = Object.entries(cart).filter(([, qty]) => qty > 0).map(([id, qty]) => ({item: product(id), qty})).filter(({item}) => item);
  const count = entries.reduce((sum, entry) => sum + entry.qty, 0);
  const subtotal = entries.reduce((sum, entry) => sum + entry.item.price * entry.qty, 0);
  const tax = subtotal * 0.08;
  $('#headerCount').textContent = count;
  $('#cartCountLabel').textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
  $('#subtotal').textContent = money(subtotal);
  $('#tax').textContent = money(tax);
  $('#total').textContent = money(subtotal + tax);
  $('#checkoutBtn').disabled = count === 0;
  $('#cartItems').innerHTML = entries.length ? entries.map(({item, qty}) => `<div class="cart-line"><span class="cart-thumb" style="background:${item.color}">${item.emoji}</span><span class="cart-line-copy"><strong>${item.name}</strong><small>${money(item.price)} each</small></span><span><span class="qty-control"><button aria-label="Remove one ${item.name}" data-qty="${item.id}" data-delta="-1">−</button><span>${qty}</span><button aria-label="Add one ${item.name}" data-qty="${item.id}" data-delta="1">+</button></span><small class="line-price">${money(item.price * qty)}</small></span></div>`).join('') : '<div class="empty-cart"><span>🛍️</span><b>Your basket is ready</b><small>Add a favourite or try a simulated scan.</small></div>';
}
function addToCart(id, quantity = 1, message = true) {
  const item = product(id); if (!item) return;
  cart[id] = (cart[id] || 0) + quantity;
  if (cart[id] <= 0) delete cart[id];
  save(); renderCart();
  if (message) showToast(`${item.name} ${quantity > 0 ? 'added to' : 'removed from'} your cart`);
}
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}
function appendChatMessage(role, text, recommendations = [], options = {}) {
  const message = document.createElement('article');
  message.className = `chat-message ${role === 'user' ? 'user-message' : 'assistant-message'}${options.typing ? ' typing-message' : ''}`;
  if (options.typing) {
    message.setAttribute('aria-label','Cartwise AI is thinking');
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble typing-indicator';
    for (let dot = 0; dot < 3; dot += 1) bubble.append(document.createElement('span'));
    message.append(bubble);
  } else {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = text;
    message.append(bubble);
    for (const recommendation of recommendations) {
      const item = product(recommendation.productId);
      if (!item) continue;
      const card = document.createElement('div');
      card.className = 'chat-product-card';
      const emoji = document.createElement('span');
      emoji.className = 'chat-product-emoji';
      emoji.setAttribute('aria-hidden','true');
      emoji.textContent = item.emoji;
      const detail = document.createElement('span');
      detail.className = 'chat-product-detail';
      const name = document.createElement('strong');
      name.textContent = item.name;
      const price = document.createElement('small');
      price.textContent = money(item.price);
      const reason = document.createElement('small');
      reason.className = 'chat-product-reason';
      reason.textContent = recommendation.reason;
      detail.append(name,price,reason);
      const addButton = document.createElement('button');
      addButton.className = 'chat-product-add';
      addButton.type = 'button';
      addButton.dataset.chatAdd = String(item.id);
      addButton.setAttribute('aria-label',`Add ${item.name} to cart`);
      addButton.textContent = 'Add';
      card.append(emoji,detail,addButton);
      message.append(card);
    }
  }
  $('#chatMessages').append(message);
  $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
  return message;
}
function buildAssistantContext() {
  return {
    products:products.map((item) => item.id),
    cart:Object.entries(cart)
      .filter(([,quantity]) => Number.isInteger(quantity) && quantity > 0)
      .map(([id,quantity]) => ({id:Number(id),quantity})),
    selectedStore:selectedStore ? {name:selectedStore.name,address:selectedStore.address} : null,
    nearbyStores:nearbyStoreResults.map((store) => ({
      name:store.name,
      address:store.address,
      category:store.category,
      distanceKm:Number(store.distance.toFixed(2))
    })),
    selectedCategory:currentCategory,
    currency
  };
}
function setChatBusy(busy) {
  chatBusy = busy;
  $('#chatSendBtn').disabled = busy;
  $('#chatInput').disabled = busy;
  $('#chatLauncher').disabled = busy && !$('#chatPanel').hidden;
  $('#chatMessages').setAttribute('aria-busy',busy ? 'true' : 'false');
}
function openChat() {
  $('#chatPanel').hidden = false;
  $('#chatPanel').setAttribute('aria-hidden','false');
  $('#chatLauncher').setAttribute('aria-expanded','true');
  $('#chatInput').focus();
}
function closeChat({restoreFocus = true} = {}) {
  $('#chatPanel').hidden = true;
  $('#chatPanel').setAttribute('aria-hidden','true');
  $('#chatLauncher').setAttribute('aria-expanded','false');
  if (restoreFocus) $('#chatLauncher').focus();
}
async function sendChatMessage(rawMessage) {
  if (chatBusy) return;
  const message = rawMessage.trim();
  if (!message || message.length > 1200) return;
  const previousConversation = chatConversation.slice(-12);
  $('#chatQuickPrompts').hidden = true;
  appendChatMessage('user',message);
  chatConversation.push({role:'user',content:message});
  chatConversation = chatConversation.slice(-12);
  $('#chatInput').value = '';
  $('#chatInput').style.height = '';
  setChatBusy(true);
  const typing = appendChatMessage('assistant','',[],{typing:true});
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(),30_000);
  try {
    const response = await fetch('/api/chat',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        message,
        context:buildAssistantContext(),
        conversation:previousConversation
      }),
      signal:controller.signal
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error('Cartwise AI returned an unexpected response. Please try again.');
    }
    if (!response.ok || !result || result.ok !== true) {
      throw new Error(result && result.ok === false && typeof result.error === 'string'
        ? result.error
        : 'Sorry, I’m having trouble connecting right now. Please try again.');
    }
    if (typeof result.message !== 'string' || !Array.isArray(result.recommendations)
      || !result.recommendations.every((recommendation) => recommendation
        && Number.isInteger(recommendation.productId)
        && product(recommendation.productId)
        && typeof recommendation.reason === 'string')) {
      throw new Error('Cartwise AI returned an unexpected response. Please try again.');
    }
    typing.remove();
    appendChatMessage('assistant',result.message,result.recommendations);
    chatConversation.push({role:'assistant',content:result.message});
    chatConversation = chatConversation.slice(-12);
  } catch (error) {
    typing.remove();
    const errorMessage = error.name === 'AbortError'
      ? 'Cartwise AI took too long to respond. Please try again.'
      : error instanceof TypeError
        ? 'Unable to reach Cartwise AI. Start the website with npm start and try again.'
        : error.message;
    appendChatMessage('assistant',errorMessage);
  } finally {
    clearTimeout(timeout);
    setChatBusy(false);
    $('#chatInput').focus();
  }
}
function renderRecommendations() {
  const ids = Object.keys(cart).filter((id) => cart[id] > 0).flatMap((id) => recommendations[id] || []);
  let unique = [...new Set(ids)].filter((id) => !cart[id]);
  if (!unique.length) unique = [2, 1, 5].filter((id) => !cart[id]);
  const picks = unique.slice(0, 3).map(product).filter(Boolean);
  renderProducts(picks);
  $('#catalogue').scrollIntoView({behavior:'smooth',block:'start'});
  showToast(picks.length ? 'A few thoughtful picks for your basket' : 'You have discovered all our picks!');
}
function renderOrderHistory() {
  $('#orderHistoryList').innerHTML = orders.length ? [...orders].reverse().map((order) => `<div class="order-row"><div><strong>Order ${order.id}</strong><b>${money(order.total, order.currency || 'USD')}</b></div><p>${new Date(order.date).toLocaleString()} · ${order.items.map((line) => `${line.qty}× ${line.name}`).join(', ')}</p></div>`).join('') : '<div class="empty-cart"><span>🧾</span><b>No orders yet</b><small>Your completed shops will show up here.</small></div>';
}
function checkout() {
  const lines = Object.entries(cart).filter(([, qty]) => qty > 0).map(([id, qty]) => ({...product(id), qty}));
  if (!lines.length) return;
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
  const tax = subtotal * .08;
  const order = {id: `GW-${String(Date.now()).slice(-6)}`, date: new Date().toISOString(), currency, storeName:selectedStore ? selectedStore.name : 'Greenway Market', items: lines.map(({name, qty}) => ({name, qty})), subtotal, tax, total: subtotal + tax};
  orders.push(order); cart = {}; save(); renderCart();
  $('#checkoutMessage').textContent = `Thanks for shopping at ${order.storeName}. Your order ${order.id} is confirmed.`;
  $('#invoiceBox').innerHTML = `${lines.map((line) => `<div><span>${line.qty} × ${line.name}</span><b>${money(line.price * line.qty)}</b></div>`).join('')}<div><span>Estimated tax</span><b>${money(tax)}</b></div><div class="invoice-total"><span>Total paid</span><span>${money(order.total)}</span></div><div><span>Store</span><b>${order.storeName}</b></div><div><span>Order reference</span><b>${order.id}</b></div>`;
  $('#checkoutDialog').showModal();
}

document.addEventListener('click', (event) => {
  const add = event.target.closest('[data-add]');
  const qty = event.target.closest('[data-qty]');
  const favorite = event.target.closest('[data-favorite]');
  if (add) addToCart(add.dataset.add);
  if (qty) addToCart(qty.dataset.qty, Number(qty.dataset.delta));
  if (favorite) { favorite.classList.toggle('liked'); favorite.textContent = favorite.classList.contains('liked') ? '♥' : '♡'; }
});
$('#categoryRow').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-category]'); if (!chip) return;
  currentCategory = chip.dataset.category;
  document.querySelectorAll('.category-chip').forEach((el) => el.classList.toggle('selected', el === chip));
  const categoryProducts = currentCategory === 'All' ? products : products.filter((item) => item.category === currentCategory);
  renderProducts(categoryProducts);
});
function renderScanOptions() {
  $('#scanProduct').innerHTML = products.map((item) => `<option value="${item.id}">${item.name} · ${money(item.price)}</option>`).join('');
}
$('#currencySelect').value = currency;
$('#currencySelect').addEventListener('change', (event) => {
  currency = event.target.value;
  localStorage.setItem('cartwise-currency', JSON.stringify(currency));
  renderProducts(visibleProducts);
  renderCart();
  renderScanOptions();
  if ($('#ordersDialog').open) renderOrderHistory();
});
renderScanOptions();
$('#chatLauncher').addEventListener('click',openChat);
$('#chatCloseBtn').addEventListener('click',closeChat);
$('#chatForm').addEventListener('submit',(event) => {
  event.preventDefault();
  sendChatMessage($('#chatInput').value);
});
$('#chatInput').addEventListener('keydown',(event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    $('#chatForm').requestSubmit();
  }
});
$('#chatInput').addEventListener('input',(event) => {
  event.currentTarget.style.height = '';
  event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight,100)}px`;
});
$('#chatQuickPrompts').addEventListener('click',(event) => {
  const prompt = event.target.closest('[data-chat-prompt]');
  if (prompt && !chatBusy) sendChatMessage(prompt.dataset.chatPrompt);
});
$('#chatMessages').addEventListener('click',(event) => {
  const addButton = event.target.closest('[data-chat-add]');
  if (addButton) addToCart(addButton.dataset.chatAdd);
});
document.addEventListener('keydown',(event) => {
  if (event.key === 'Escape' && !$('#chatPanel').hidden) closeChat();
});
$('#scanBtn').addEventListener('click', async () => {
  const id = Number($('#scanProduct').value);
  addToCart(id, 1, false);
  const item = product(id); $('#scanFeedback').textContent = `✓ ${item.name} scanned`; $('#scanFeedback').classList.add('show');
  showToast(`Simulated scan: ${item.name} added`);
  setTimeout(() => $('#scanFeedback').classList.remove('show'), 2300);
});
$('#checkoutBtn').addEventListener('click', checkout);
$('#doneBtn').addEventListener('click', () => $('#checkoutDialog').close());
$('#historyBtn').addEventListener('click', () => { renderOrderHistory(); $('#ordersDialog').showModal(); });
$('#ordersDialog').addEventListener('click', (event) => { if (event.target === $('#ordersDialog')) $('#ordersDialog').close(); });
$('#cartJump').addEventListener('click', () => $('#cartPanel').scrollIntoView({behavior:'smooth',block:'center'}));
$('#browseBtn').addEventListener('click', () => $('#catalogue').scrollIntoView({behavior:'smooth'}));
$('#recommendBtn').addEventListener('click', renderRecommendations);
$('#helpBtn').addEventListener('click', () => showToast('A Greenway team member is on their way to help.'));
$('#detectLocationBtn').addEventListener('click', requestUserLocation);
$('#demoLocationBtn').addEventListener('click', useDemoLocation);
$('#nearbyStores').addEventListener('click', (event) => {
  const button = event.target.closest('[data-select-store]');
  if (button && !button.disabled) selectStore(button.dataset.selectStore);
});
$('#obstacleToggle').addEventListener('click', () => {
  obstacleActive = !obstacleActive;
  $('#obstacleStrip').classList.toggle('warning', obstacleActive);
  $('#obstacleBadge').classList.toggle('warning', obstacleActive);
  $('#obstacleBadge').innerHTML = `<i></i> ${obstacleActive ? 'Caution' : 'Clear'}`;
  $('#obstacleMessage').textContent = obstacleActive ? 'Obstacle ahead in aisle 3. Please slow down and steer around it.' : "Aisle is clear. You're good to go.";
  $('#obstacleToggle').textContent = obstacleActive ? 'Clear simulation' : 'Simulate obstacle';
});
$('#mobileMenu').addEventListener('click', () => {
  const opening = !$('#sidebar').classList.contains('open');
  if (opening && !$('#chatPanel').hidden) closeChat({restoreFocus:false});
  $('#sidebar').classList.toggle('open',opening);
  document.body.classList.toggle('sidebar-menu-open',opening);
  $('#mobileMenu').setAttribute('aria-expanded',String(opening));
  $('#mobileMenu').setAttribute('aria-label',opening ? 'Close menu' : 'Open menu');
});
document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => {
  $('#sidebar').classList.remove('open');
  document.body.classList.remove('sidebar-menu-open');
  $('#mobileMenu').setAttribute('aria-expanded','false');
  $('#mobileMenu').setAttribute('aria-label','Open menu');
  document.querySelectorAll('.nav-link').forEach((el) => el.classList.toggle('active', el === link));
}));
if (selectedStore) setActiveStore(selectedStore);
renderProducts(); renderCart();

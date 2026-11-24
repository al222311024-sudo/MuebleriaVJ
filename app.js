import {categories, statuses, cancelled, load, save, cartLines, makeOrder, changeStatus} from './store.mjs';

const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const notice = document.querySelector('#notice');
let currentUser = null;
let emailEnabled = false;
let registerMode = false;
let busy = false;
let db = load();
let filter = 'Todos';
let query = '';
let sort = '';
let favoritesOnly = false;
let adminTab = 'Inventario';
let timer;
const currency = new Intl.NumberFormat('es-MX', {style:'currency', currency:'MXN', maximumFractionDigits:2, minimumFractionDigits:0});
const money = value => currency.format(value);
const clean = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icons = {
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', user:'<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>', bag:'<path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>', heart:'<path d="M12 20 4 12a4.6 4.6 0 0 1 6.5-6.5L12 7l1.5-1.5A4.6 4.6 0 0 1 20 12Z"/>', close:'<path d="m6 6 12 12M18 6 6 18"/>', plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>', box:'<path d="m3 7 9-4 9 4v11l-9 4-9-4zM3 7l9 4 9-4m-9 4v11"/>', grid:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>', settings:'<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3"/>', edit:'<path d="m14 5 5 5M4 20l4-1L21 6l-4-4L4 15Z"/>', trash:'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>'
};
const icon = (name, size=20) => '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+icons[name]+'</svg>';
const btn = (action, label, classes='', data='') => '<button type="button" class="'+classes+'" data-action="'+action+'" '+data+'>'+label+'</button>';
const idAttr = id => 'data-id="'+clean(id)+'"';
const iconBtn = (action, glyph, label, data='', extra='') => btn(action, icon(glyph), 'icon-button '+extra, 'aria-label="'+label+'" title="'+label+'" '+data);
const brand = () => '<a href="#inicio" class="brand" aria-label="VJ Muebles, inicio"><img class="brand-logo" src="assets/logo.svg" alt="" width="878" height="676"></a>';
const isAdmin = () => currentUser?.role === 'admin';
const isCustomer = () => currentUser?.role === 'customer';
const emailKey = () => 'account:' + currentUser.email;

function attachCustomer(data) {
  if (!isCustomer()) return data;
  data.customers ??= {};
  const legacy = data.profile?.email?.trim().toLowerCase() === currentUser.email;
  const customer = data.customers[emailKey()] ?? (legacy
    ? {profile:data.profile, favorites:data.favorites, cart:data.cart}
    : {profile:{name:'', address:''}, favorites:[], cart:{}});
  return {...data, ...customer, profile:{...customer.profile,email:currentUser.email}};
}

async function request(path, payload) {
  const response = await fetch('/api/'+path, payload === undefined ? {} : {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
  });
  if (!response.headers.get('Content-Type')?.includes('application/json')) throw new Error('Inicia el proyecto con py servidor.py.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data;
}

function renderLogin(message='') {
  app.innerHTML = `<main id="main" class="login-layout"><div class="login-photo"></div>
    <section class="login-section"><div class="login-panel">${brand()}
    <h1>${registerMode?'Crea tu cuenta':'Inicia sesión'}</h1>
    <p class="quiet">${registerMode?'Regístrate para comprar y consultar tus pedidos.':'Ingresa con tu correo y contraseña para continuar.'}</p>
    <form id="login-form" class="form">
      <label>Correo electrónico<input type="email" name="email" maxlength="150" autocomplete="username" required></label>
      <label>Contraseña<input type="password" name="password" ${registerMode?'minlength="8" ':''}maxlength="128" autocomplete="${registerMode?'new-password':'current-password'}" required></label>
      <p class="form-error" role="alert">${clean(message)}</p>
      <button class="button primary">${registerMode?'Crear cuenta':'Iniciar sesión'}</button>
    </form><div class="login-switch">${btn('toggle-login', registerMode?'Ya tengo cuenta':'Crear cuenta de cliente', 'subtle')}</div></div></section></main>`;
}

async function logout() {
  try {
    await request('logout',{});
    currentUser = null;
    registerMode = false;
    filter = 'Todos';
    query = '';
    sort = '';
    favoritesOnly = false;
    adminTab = 'Inventario';
    location.hash = 'login';
    route();
  } catch (err) { toast(err.message); }
}

app.addEventListener('submit', async event => {
  if (event.target.id !== 'login-form') return;
  event.preventDefault();
  if (busy) return;
  const form = event.target;
  busy = true;
  const submit = form.querySelector('button');
  submit.disabled = true;
  try {
    const result = await request(registerMode?'register':'login',Object.fromEntries(new FormData(form)));
    currentUser = result.user;
    emailEnabled = result.emailEnabled;
    db = attachCustomer(load());
    location.hash = isAdmin()?'admin':'inicio';
    route();
  } catch (err) {
    showError(form,err.message);
  } finally {
    busy = false;
    submit.disabled = false;
  }
});
const getProduct = id => db.products.find(product => product.id === id);
const qtyTotal = () => cartLines(db).reduce((sum,line) => sum+line.qty,0);
const picture = (p, extra='') => '<img '+extra+' src="'+clean(p.image || 'assets/logo.svg')+'" alt="'+clean(p.name)+'">';

function toast(message) {
  (modal.open ? modal : document.body).append(notice);
  notice.textContent = message;
  notice.classList.add('visible');
  clearTimeout(timer);
  timer = setTimeout(() => notice.classList.remove('visible'), 3600);
}

function commit(change) {
  try {
    const stored = load();
    db = attachCustomer(stored);
    change(db);
    if (isCustomer()) {
      db.customers[emailKey()] = {profile:db.profile, cart:db.cart, favorites:db.favorites};
      save({...db,profile:stored.profile,cart:stored.cart,favorites:stored.favorites});
    } else {
      save(db);
    }
    return true;
  } catch (err) {
    db = attachCustomer(load());
    toast(err.message || 'No se pudieron guardar los cambios.');
    return false;
  }
}

function open(title, content, className='') {
  modal.className = className;
  modal.innerHTML = '<div class="dialog-head"><h2 id="dialog-title">'+clean(title)+'</h2>'+iconBtn('close','close','Cerrar')+'</div>'+content;
  if (!modal.open) modal.showModal();
  modal.append(notice);
}

function header() {
  return '<header class="site-top"><div class="shell nav">'+brand()+
  '<nav aria-label="Tienda"><a href="#inicio">Inicio</a><a href="#catalogo">Catálogo</a><button type="button" data-action="categories">Categorías</button></nav>'+
  '<div class="nav-actions">'+iconBtn('search','search','Buscar muebles')+iconBtn('account','user','Mi cuenta')+
  '<button class="icon-button cart-button" type="button" data-action="cart" aria-label="Carrito, '+qtyTotal()+' productos">'+icon('bag')+'<span>'+qtyTotal()+'</span></button></div></div></header>';
}

function productCard(p) {
  const liked = db.favorites.includes(p.id);
  return `<article class="card"><div class="card-media">${btn('product',picture(p,'loading="lazy"'), 'image-button', idAttr(p.id)+' aria-label="Ver '+clean(p.name)+'"')}
    ${p.badge ? '<span class="badge">'+clean(p.badge)+'</span>' : ''}
    ${iconBtn('favorite','heart',liked?'Quitar de favoritos':'Añadir a favoritos',idAttr(p.id)+' aria-pressed="'+liked+'"', 'favorite '+(liked?'liked':''))}
    </div><div class="card-info"><div><p class="category">${clean(p.category)}</p><h3>${btn('product',clean(p.name),'text-button',idAttr(p.id))}</h3><p class="material">${clean(p.material)}</p></div>${iconBtn('add','plus','Agregar '+clean(p.name)+' al carrito',idAttr(p.id)+(p.stock?'':' disabled'),'add')}</div>
    <p class="price">${money(p.price)} <small>MXN</small>${p.stock?'':' <small class="soldout">Agotado</small>'}</p></article>`;
}

function paintCatalog() {
  const text = query.trim().toLocaleLowerCase('es-MX').normalize('NFD').replace(/\p{Diacritic}/gu,'');
  const shown = db.products.filter(p =>
    (filter === 'Todos' || p.category === filter) &&
    (!favoritesOnly || db.favorites.includes(p.id)) &&
    [p.name,p.category,p.material,p.description].join(' ').toLocaleLowerCase('es-MX').normalize('NFD').replace(/\p{Diacritic}/gu,'').includes(text)
  );
  if (sort) shown.sort((a,b) => sort === 'low' ? a.price-b.price : b.price-a.price);
  document.querySelector('#results').innerHTML = shown.length ? shown.map(productCard).join('') : '<p class="empty">No hay muebles que coincidan con estos filtros.</p>';
  document.querySelector('#product-count').textContent = shown.length+' '+(shown.length === 1 ? 'mueble' : 'muebles');
}

function render() {
  if (!currentUser) return renderLogin();
  if (isAdmin()) return renderAdmin();
  app.innerHTML = header()+`<main id="main">
    <section class="hero shell" id="inicio" aria-labelledby="hero-title">
      <div class="hero-copy"><p class="eyebrow"><span></span> MUEBLES PARA EL HOGAR</p>
      <h1 id="hero-title">Haz espacio<br>para <em>vivir.</em></h1>
      <p>Texturas cálidas, materiales naturales y muebles para disfrutar tus espacios todos los días.</p>
      <a class="button primary" href="#catalogo">Explorar catálogo</a></div>
      <div class="hero-photo"><img src="assets/interior.webp" alt="Sala iluminada con sofá color arena y mesa de centro de nogal" fetchpriority="high"></div>
    </section>
    <section class="catalog shell" id="catalogo" aria-labelledby="catalog-title">
      <div class="section-head"><div><p class="eyebrow"><span></span> CATÁLOGO</p><h2 id="catalog-title">Encuentra tu próximo mueble</h2></div><p class="quiet" id="product-count"></p></div>
      <div class="catalog-tools"><div class="categories" id="categorias" aria-label="Categorías">${['Todos',...categories].map(cat=>btn('filter',cat,'chip'+(filter===cat?' selected':''),'data-value="'+cat+'" aria-pressed="'+(filter===cat)+'"')).join('')}${btn('only-favorites',icon('heart',16)+' Favoritos','chip'+(favoritesOnly?' selected':''),'aria-pressed="'+favoritesOnly+'"')}</div>
      <div class="search-tools"><label class="search-field">${icon('search',17)}<input id="catalog-search" type="search" placeholder="Buscar muebles" aria-label="Buscar muebles" value="${clean(query)}"></label><select id="sort" aria-label="Ordenar muebles"><option value="">Ordenar</option><option value="low"${sort==='low'?' selected':''}>Menor precio</option><option value="high"${sort==='high'?' selected':''}>Mayor precio</option></select></div></div>
      <div id="results" class="products"></div>
    </section></main>
    <footer><div class="shell footer-inner">${brand()}<span>Muebles para el hogar</span>${btn('logout','Cerrar sesión','subtle')}</div></footer>`;
  paintCatalog();
}

function openProduct(id) {
  const product = getProduct(id);
  if (!product) return;
  open(product.name,`<div class="detail">${picture(product)}<div><p class="category">${clean(product.category)}</p><p>${clean(product.description)}</p><p class="quiet">${clean(product.material)}</p><p class="price">${money(product.price)} <small>MXN</small></p><p class="quiet">${product.stock ? product.stock+' disponibles' : 'Agotado'}</p>${btn('add','Agregar al carrito','button primary',idAttr(id)+(product.stock?'':' disabled'))}</div></div>`, 'wide');
}

function openCart() {
  const lines = cartLines(db);
  open('Tu carrito', lines.length ? '<div class="lines">'+lines.map(p =>
    `<div class="cart-line">${picture(p)}<div><strong>${clean(p.name)}</strong><p class="quiet">${money(p.price)} MXN por unidad</p>${p.qty>p.stock?'<p class="soldout">Disponibles: '+p.stock+'</p>':''}<div class="stepper">${iconBtn('reduce','minus','Reducir cantidad',idAttr(p.id))}<span>${p.qty}</span>${iconBtn('add','plus','Aumentar cantidad',idAttr(p.id)+(p.qty>=p.stock?' disabled':''))}${btn('remove','Quitar','subtle',idAttr(p.id))}</div></div><strong>${money(p.price*p.qty)}</strong></div>`).join('')+
    '</div><div class="total"><strong>Total</strong><strong>'+money(lines.reduce((sum,p)=>sum+p.qty*p.price,0))+' MXN</strong></div>'+btn('checkout','Continuar al pedido','button primary full') :
    '<p class="empty">Tu carrito está vacío.</p>'+btn('close','Seguir explorando','button primary'), 'drawer');
}

const fields = (person={}) => `<label>Nombre completo<input required name="name" maxlength="100" autocomplete="name" value="${clean(person.name)}"></label>
  <label>Correo electrónico<input type="email" value="${clean(person.email)}" readonly></label>
  <label>Dirección de entrega<textarea required name="address" maxlength="350" autocomplete="street-address">${clean(person.address)}</textarea></label>`;
const customerData = values => ({name:values.name.trim(), email:currentUser.email, address:values.address.trim()});
const orderDate = order => new Date(order.date).toLocaleDateString('es-MX', {dateStyle:'medium'});
function orderSummary(order) {
  return `<p class="quiet">${orderDate(order)} · ${clean(order.status)}</p><ul class="order-items">${order.lines.map(line=>'<li>'+line.qty+' × '+clean(line.name)+' <strong>'+money(line.price*line.qty)+'</strong></li>').join('')}</ul><div class="total"><strong>Total</strong><strong>${money(order.total)} MXN</strong></div>`;
}

function openAccount() {
  const orders = db.orders.filter(order=>order.customer.email===currentUser.email);
  open('Mi cuenta', `<form data-form="profile" class="form">${fields(db.profile)}<button class="button primary">Guardar perfil</button></form>
    <div class="account-orders"><h3>Mis pedidos</h3>${orders.length ? orders.map(order=>'<details><summary>Pedido '+clean(order.id)+' <span>'+clean(order.status)+'</span></summary>'+orderSummary(order)+ticketControls(order)+'</details>').join('') : '<p class="quiet">Todavía no hay pedidos para este perfil.</p>'}</div>`, 'drawer');
}

function renderAdmin() {
  const low = db.products.filter(p=>p.stock<=3).length;
  const active = db.orders.filter(o=>statuses.slice(0,3).includes(o.status)).length;
  app.innerHTML = `<div class="admin-layout"><aside class="admin-aside">${brand()}<p class="eyebrow">ADMINISTRACIÓN</p><nav aria-label="Panel de administración">
    ${btn('admin-tab',icon('grid')+' Inventario','admin-link'+(adminTab==='Inventario'?' current':''),'data-value="Inventario"')}
    ${btn('admin-tab',icon('box')+' Pedidos','admin-link'+(adminTab==='Pedidos'?' current':''),'data-value="Pedidos"')}</nav><div class="aside-bottom">${btn('logout','Cerrar sesión','subtle')}</div></aside>
    <main id="main" class="admin-main"><div class="admin-title"><div><p class="eyebrow"><span></span> PANEL DE ADMINISTRACIÓN</p><h1>${adminTab}</h1></div>${adminTab==='Inventario'?btn('edit',icon('plus')+' Nuevo mueble','button primary'):''}</div>
    <div class="metrics"><div><span>Muebles en catálogo</span><strong>${db.products.length}</strong></div><div><span>Con 3 piezas o menos</span><strong>${low}</strong></div><div><span>Pedidos activos</span><strong>${active}</strong></div></div>
    ${adminTab==='Inventario'?inventory():adminOrders()}</main></div>`;
}

function inventory() {
  if (!db.products.length) return '<p class="empty">El catálogo está vacío. Agrega un mueble para comenzar.</p>';
  return '<div class="table-wrap"><table><thead><tr><th>Mueble</th><th>Categoría</th><th>Precio MXN</th><th>Existencias</th><th>Acciones</th></tr></thead><tbody>'+
    db.products.map(p=>'<tr><td><div class="product-cell">'+picture(p)+'<strong>'+clean(p.name)+'</strong></div></td><td>'+clean(p.category)+'</td><td>'+money(p.price)+'</td><td><span class="stock'+(p.stock<=3?' low':'')+'">'+p.stock+'</span></td><td><div class="table-actions">'+iconBtn('edit','edit','Editar '+clean(p.name),idAttr(p.id))+iconBtn('delete','trash','Eliminar '+clean(p.name),idAttr(p.id))+'</div></td></tr>').join('')+'</tbody></table></div>';
}

function adminOrders() {
  if (!db.orders.length) return '<p class="empty">Los pedidos aparecerán aquí cuando se registren en la tienda.</p>';
  return '<div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Total MXN</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>'+
    db.orders.map(o=>'<tr><td><strong>'+clean(o.id)+'</strong><br><small>'+orderDate(o)+'</small></td><td>'+clean(o.customer.name)+'</td><td>'+money(o.total)+'</td><td><span class="stock">'+clean(o.status)+'</span></td><td>'+btn('order','Ver pedido','subtle',idAttr(o.id))+'</td></tr>').join('')+'</tbody></table></div>';
}

function editProduct(id) {
  const p = getProduct(id) || {};
  open(id?'Editar mueble':'Nuevo mueble',`<form data-form="product" data-id="${clean(id)}" class="form">
    <label>Nombre<input name="name" required maxlength="80" value="${clean(p.name)}"></label>
    <div class="form-row"><label>Categoría<select name="category">${categories.map(cat=>'<option'+(cat===p.category?' selected':'')+'>'+cat+'</option>').join('')}</select></label>
    <label>Material<input name="material" required maxlength="80" value="${clean(p.material)}"></label></div>
    <div class="form-row"><label>Precio en MXN<input name="price" type="number" min="0.01" max="99999999" step="0.01" required value="${clean(p.price)}"></label>
    <label>Existencias<input name="stock" type="number" min="0" max="999999" step="1" required value="${clean(p.stock)}"></label></div>
    <label>Descripción<textarea name="description" required maxlength="1000">${clean(p.description)}</textarea></label>
    <label>Imagen nueva (opcional)<input name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/avif"></label>
    <label>Etiqueta (opcional)<input name="badge" maxlength="25" placeholder="Novedad" value="${clean(p.badge)}"></label>
    <button class="button primary">Guardar mueble</button></form>`);
}

function openOrder(id) {
  const order = db.orders.find(item=>item.id===id);
  if (!order) return;
  const options = statuses.slice(statuses.indexOf(order.status));
  if (statuses.slice(0,2).includes(order.status)) options.push(cancelled);
  open('Pedido '+id, `<p><strong>${clean(order.customer.name)}</strong><br>${clean(order.customer.email)}<br>${clean(order.customer.address)}</p>
    ${orderSummary(order)}${[cancelled,statuses.at(-1)].includes(order.status)?'':`<form data-form="status" data-id="${clean(id)}" class="form">
    <label>Estado del pedido<select name="status">${options.map(s=>'<option>'+s+'</option>').join('')}</select></label><button class="button primary">Actualizar estado</button></form>`}`);
}

function ticketText(order) {
  return [
    'Muebleria VJ', 'Ticket de compra', 'Pedido: '+order.id, 'Fecha: '+orderDate(order),
    'Cliente: '+order.customer.name, 'Correo: '+order.customer.email,
    'Dirección: '+order.customer.address, '', 'Productos',
    ...order.lines.map(line=>line.qty+' × '+line.name+' | '+money(line.price)+' MXN c/u | '+money(line.price*line.qty)+' MXN'),
    '', 'Total: '+money(order.total)+' MXN', 'Pedido de demostración. Sin cobro realizado.', ''
  ].join('\r\n');
}

function downloadTicket(order) {
  const url = URL.createObjectURL(new Blob(['\uFEFF',ticketText(order)],{type:'text/plain;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Ticket-'+order.id+'.txt';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function ticketControls(order) {
  const sent = order.emailSent;
  return '<div class="ticket-actions">'+btn('ticket','Descargar ticket TXT','button outline',idAttr(order.id))+
    (emailEnabled && !sent ? btn('send-ticket','Enviar ticket por correo','button outline',idAttr(order.id)) : '')+
    '<p class="quiet email-result" role="status" data-order="'+clean(order.id)+'">'+
    (sent?'Correo enviado.':emailEnabled?'':'Envío por correo sin configurar.')+'</p></div>';
}

async function emailTicket(order, automatic=false) {
  const status = modal.querySelector('[data-order="'+order.id+'"]');
  const button = modal.querySelector('[data-action="send-ticket"][data-id="'+order.id+'"]');
  if (button) button.disabled = true;
  if (status) status.textContent = 'Enviando correo…';
  try {
    await request('send-ticket',{id:order.id,ticket:ticketText(order)});
    if (currentUser?.email === order.customer.email) {
      commit(data=>{
        const saved = data.orders.find(item=>item.id===order.id && item.customer.email===currentUser.email);
        if (saved) saved.emailSent = true;
      });
    }
    if (status) status.textContent = 'Correo enviado a '+order.customer.email+'.';
    if (button) button.remove();
  } catch (err) {
    if (status) status.textContent = err.message;
    else if (!automatic) toast(err.message);
  } finally {
    if (button) button.disabled = false;
  }
}

function adjustCart(id, delta, remove=false) {
  if (!commit(data => {
    const qty = (data.cart[id] || 0)+delta;
    const product = data.products.find(p=>p.id===id);
    if (delta>0 && (!product || qty>product.stock)) throw new Error('No hay más piezas disponibles.');
    if (remove || qty<=0) delete data.cart[id];
    else data.cart[id] = qty;
  })) return;
  const cart = modal.classList.contains('drawer') && modal.querySelector('#dialog-title')?.textContent === 'Tu carrito';
  const counter = app.querySelector('.cart-button');
  if (counter) {
    counter.querySelector('span').textContent = qtyTotal();
    counter.setAttribute('aria-label','Carrito, '+qtyTotal()+' productos');
  }
  if (cart) openCart();
  else if (delta>0) toast('Agregado al carrito.');
}

function setFilter(button, action) {
  if (action === 'filter') {
    filter = button.dataset.value;
    app.querySelectorAll('[data-action="filter"]').forEach(chip => {
      const on = chip.dataset.value === filter;
      chip.classList.toggle('selected', on);
      chip.setAttribute('aria-pressed', on);
    });
  } else {
    favoritesOnly = !favoritesOnly;
    button.classList.toggle('selected', favoritesOnly);
    button.setAttribute('aria-pressed', favoritesOnly);
  }
  paintCatalog();
}

const adminActions = new Set(['admin-tab','edit','delete','confirm-delete','order']);
document.addEventListener('click', event => {
  if (event.target === modal) {
    const rect = modal.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) modal.close();
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const {action,id,value} = button.dataset;
  if (action === 'toggle-login' && !currentUser && !busy) {
    registerMode = !registerMode;
    renderLogin();
    return;
  }
  if (!currentUser || (adminActions.has(action) && !isAdmin())) return;
  switch (action) {
    case 'close': modal.close(); break;
    case 'product': openProduct(id); break;
    case 'account': openAccount(); break;
    case 'cart': openCart(); break;
    case 'search': document.querySelector('#catalog-search').focus(); break;
    case 'categories': document.querySelector('#categorias').scrollIntoView({block:'center',behavior:'smooth'}); document.querySelector('#categorias button').focus({preventScroll:true}); break;
    case 'filter':
    case 'only-favorites': setFilter(button, action); break;
    case 'favorite':
      if (commit(data => {
        data.favorites = data.favorites.includes(id) ? data.favorites.filter(item=>item!==id) : [...data.favorites,id];
      })) {
        const liked = db.favorites.includes(id);
        if (favoritesOnly && !liked) paintCatalog();
        else {
          const label = liked ? 'Quitar de favoritos' : 'Añadir a favoritos';
          button.classList.toggle('liked',liked);
          button.title = label;
          button.setAttribute('aria-label',label);
          button.setAttribute('aria-pressed',liked);
        }
      }
      break;
    case 'add': adjustCart(id,1); break;
    case 'reduce': adjustCart(id,-1); break;
    case 'remove': adjustCart(id,0,true); break;
    case 'checkout':
      if (cartLines(db).some(p=>p.qty>p.stock)) {
        toast('Ajusta las cantidades a las existencias disponibles.');
        return;
      }
      open('Datos de entrega', '<p class="quiet">Pedido de demostración. No se hará ningún cargo.</p><form data-form="checkout" class="form">'+fields(db.profile)+'<button class="button primary">Confirmar pedido</button></form>', 'drawer');
      break;
    case 'ticket':
    case 'send-ticket': {
      const order = isCustomer() && db.orders.find(item=>item.id===id && item.customer.email===currentUser.email);
      if (order && action==='ticket') downloadTicket(order);
      if (order && action==='send-ticket' && emailEnabled) emailTicket(order);
      break;
    }
    case 'admin-tab': adminTab = value; renderAdmin(); break;
    case 'logout': logout(); break;
    case 'edit': editProduct(id); break;
    case 'order': openOrder(id); break;
    case 'delete': {
      const p = getProduct(id);
      if (p) open('Eliminar mueble', '<p>¿Quieres eliminar <strong>'+clean(p.name)+'</strong> del catálogo?</p><div class="dialog-actions">'+btn('close','Cancelar','button outline')+btn('confirm-delete','Eliminar mueble','button danger',idAttr(id))+'</div>');
      break;
    }
    case 'confirm-delete':
      if (commit(data=>{
        data.products = data.products.filter(p=>p.id!==id);
        data.favorites = data.favorites.filter(item=>item!==id);
        delete data.cart[id];
        for (const customer of Object.values(data.customers ?? {})) {
          customer.favorites = customer.favorites.filter(item=>item!==id);
          delete customer.cart[id];
        }
      })) { modal.close(); renderAdmin(); toast('Mueble eliminado.'); }
      break;
  }
});

app.addEventListener('input', e => {
  if (e.target.id === 'catalog-search') { query = e.target.value; paintCatalog(); }
});
app.addEventListener('change', e => {
  if (e.target.id === 'sort') { sort = e.target.value; paintCatalog(); }
});

function showError(form, message) {
  let error = form.querySelector('.form-error');
  if (!error) {
    error = document.createElement('p');
    error.className = 'form-error';
    error.setAttribute('role','alert');
    form.append(error);
  }
  error.textContent = message;
}

async function photoData(file) {
  if (!file.size) return undefined;
  if (file.size > 12 * 1024 * 1024) throw new Error('Selecciona una imagen de hasta 12 MB.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('Selecciona una imagen PNG, JPG, WebP o AVIF válida.'); }
  const scale = Math.min(1, 900 / Math.max(bitmap.width,bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width*scale));
  canvas.height = Math.max(1, Math.round(bitmap.height*scale));
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/webp',0.80);
}

modal.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const {form: mode,id} = form.dataset;
  const values = Object.fromEntries(new FormData(form));
  if (isCustomer() && (mode === 'profile' || mode === 'checkout')) {
    const person = customerData(values);
    if (!person.name || !person.address) { showError(form,'Completa el nombre y la dirección.'); return; }
    if (mode === 'profile') {
      if (commit(data=>{ data.profile = person; })) { openAccount(); toast('Perfil guardado.'); }
    } else {
      let order;
      if (!commit(data=>{ order = makeOrder(data,person,'CF-'+crypto.randomUUID().slice(0,8).toUpperCase(),Date.now()); })) return;
      render();
      open('Pedido registrado', '<p>Tu pedido <strong>'+clean(order.id)+'</strong> está pendiente. Puedes ver su estado en Mi cuenta.</p>'+orderSummary(order)+ticketControls(order)+btn('close','Seguir explorando','button primary'), 'drawer');
      downloadTicket(order);
      if (emailEnabled) emailTicket(order,true);
    }
    return;
  }
  if (!isAdmin()) return;
  if (mode === 'status') {
    if (commit(data=>{
      const order = data.orders.find(item=>item.id===id);
      if (!order) throw new Error('No se encontró el pedido.');
      changeStatus(data,order,values.status);
    })) { renderAdmin(); openOrder(id); toast('Estado actualizado.'); }
  }
  if (mode === 'product') {
    const submit = form.querySelector('button[type="submit"],button:not([type])');
    submit.disabled = true;
    try {
      const entry = {name:values.name.trim(), category:values.category, material:values.material.trim(), price:Number(values.price), stock:Number(values.stock), description:values.description.trim(), badge:values.badge.trim()};
      if (!entry.name || !entry.material || !entry.description) throw new Error('Completa el nombre, material y descripción.');
      const image = await photoData(values.photo);
      if (!isAdmin() || !form.isConnected || !modal.open) return;
      if (commit(data=>{
        const index = data.products.findIndex(p=>p.id===id);
        if (id && index<0) throw new Error('Este mueble ya no existe en el catálogo.');
        if (id) data.products[index] = {...data.products[index], ...entry, ...(image ? {image} : {})};
        else data.products.push({...entry,id:crypto.randomUUID(),image});
      })) { modal.close(); renderAdmin(); toast(id?'Mueble actualizado.':'Mueble agregado.'); }
    } catch (err) {
      showError(form,err.message);
    } finally {
      submit.disabled = false;
    }
  }
});

function route() {
  if (modal.open) modal.close();
  render();
  const section = document.getElementById(location.hash.slice(1));
  if (section) section.scrollIntoView({block:'start'});
  else window.scrollTo(0,0);
}
window.addEventListener('hashchange',route);
window.addEventListener('storage', e => {
  if (e.key !== 'casa-forma-v1') return;
  db = attachCustomer(load());
  render();
});
document.addEventListener('error', e => {
  if (e.target instanceof HTMLImageElement && !e.target.src.endsWith('/assets/logo.svg')) e.target.src = 'assets/logo.svg';
}, true);
request('session').then(result=>{
  currentUser = result.user;
  emailEnabled = result.emailEnabled;
  db = attachCustomer(load());
  route();
}).catch(err=>renderLogin(err.message==='Failed to fetch' ? 'No se pudo conectar con el servidor.' : err.message));

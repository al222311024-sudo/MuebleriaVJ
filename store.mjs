const key = 'MuebleriaVJ-v1';
export const categories = ['Sala', 'Comedor', 'Almacenamiento', 'Iluminación'];
export const statuses = ['Pendiente', 'En preparación', 'Enviado', 'Entregado'];
export const cancelled = 'Cancelado';
export const seed = [
  ['sillon-nido', 'Sillón Nido', 'Sala', 'Nogal y tela bouclé', 5490, 10, 'Sillón de respaldo bajo, asiento amplio y estructura de nogal. Un rincón cómodo para leer y descansar.', 'Novedad'],
  ['mesa-olmo', 'Mesa de centro Olmo', 'Sala', 'Nogal natural', 3890, 14, 'Mesa baja con esquinas redondeadas y superficie amplia para libros, tazas y objetos cotidianos.', ''],
  ['sofa-calma', 'Sofá Calma', 'Sala', 'Lino color arena', 15990, 6, 'Sofá de tres plazas con líneas rectas, cojines amplios y tapizado en tono arena.', ''],
  ['mesa-raiz', 'Mesa de comedor Raíz', 'Comedor', 'Nogal natural', 11990, 5, 'Mesa ovalada con patas rectas y acabado cálido. Su forma facilita sentar hasta seis personas.', ''],
  ['aparador-linde', 'Aparador Linde', 'Almacenamiento', 'Nogal natural', 9490, 4, 'Aparador de tres puertas con líneas sencillas para guardar vajilla, libros o textiles.', ''],
  ['lampara-alba', 'Lámpara de pie Alba', 'Iluminación', 'Metal negro y lino', 2490, 12, 'Lámpara de pie con pantalla cónica que difunde luz suave junto al sofá o la cama.', '']
].map(([id, name, category, material, price, stock, description, badge]) =>
  ({ id, name, category, material, price, stock, description, badge, image: 'assets/' + id + '.webp' }));

export function load() {
  const saved = localStorage.getItem(key);
  return saved ? JSON.parse(saved) : { products: structuredClone(seed), orders: [], cart: {}, favorites: [], profile: {name:'', email:'', address:''} };
}

export function save(db) {
  localStorage.setItem(key, JSON.stringify(db));
}

export function cartLines(db) {
  return Object.entries(db.cart).flatMap(([id, qty]) => {
    const product = db.products.find(item => item.id === id);
    return product ? [{...product, qty}] : [];
  });
}

export function makeOrder(db, customer, id, date) {
  const lines = cartLines(db);
  if (!lines.length) throw new Error('Tu carrito está vacío.');
  if (lines.some(line => line.qty > line.stock)) {
    throw new Error('Algunos muebles superan la existencia disponible. Ajusta sus cantidades en el carrito.');
  }
  const order = {
    id, date, customer, status: statuses[0],
    lines: lines.map(({id, name, price, qty}) => ({id, name, price, qty})),
    total: lines.reduce((sum, line) => sum + line.price * line.qty, 0)
  };
  for (const line of lines) db.products.find(item => item.id === line.id).stock -= line.qty;
  db.orders.unshift(order);
  db.cart = {};
  db.profile = customer;
  return order;
}

export function changeStatus(db, order, next) {
  if (order.status === cancelled || ![...statuses, cancelled].includes(next)) throw new Error('El estado seleccionado no es válido.');
  if (next === cancelled) {
    if (!statuses.slice(0, 2).includes(order.status)) throw new Error('Solo se pueden cancelar pedidos pendientes o en preparación.');
    for (const line of order.lines) {
      const product = db.products.find(item => item.id === line.id);
      if (product) product.stock += line.qty;
    }
  } else if (statuses.indexOf(next) < statuses.indexOf(order.status)) {
    throw new Error('Selecciona un estado posterior al estado actual.');
  }
  order.status = next;
}

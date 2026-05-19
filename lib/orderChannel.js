var POS_SOURCES = {
  pos: true,
  shopify_draft_order: true
};

var ONLINE_SOURCES = {
  web: true,
  subscription_contract: true,
  iphone: true,
  android: true,
  shopify_mobile_app: true,
  mobile_app: true,
  checkout: true,
  online_store: true
};

function parseOrderNotes(order) {
  var notes = {};
  if (!order || !order.note_attributes || !Array.isArray(order.note_attributes)) {
    return notes;
  }
  for (var i = 0; i < order.note_attributes.length; i++) {
    var attr = order.note_attributes[i];
    if (!attr || !attr.name) {
      continue;
    }
    var key = attr.name.replace(/ /g, '_').replace(/-/g, '_').toLowerCase();
    notes[key] = attr.value === null || attr.value === undefined ? '' : attr.value.toString();
  }
  return notes;
}

function getOrderChannel(order) {
  if (!order) {
    return { key: 'online', label: 'Online' };
  }

  var source = (order.source_name || '').toLowerCase();
  var notes = parseOrderNotes(order);

  if (POS_SOURCES[source]) {
    return { key: 'pos', label: 'POS' };
  }

  if (ONLINE_SOURCES[source]) {
    return { key: 'online', label: 'Online' };
  }

  if (notes.type === 'Delivery' || notes.type === 'Pickup') {
    return { key: 'pos', label: 'POS' };
  }

  if (notes.checkout_method === 'delivery' || notes.checkout_method === 'pickup') {
    return { key: 'online', label: 'Online' };
  }

  if (order.location_id) {
    return { key: 'pos', label: 'POS' };
  }

  return { key: 'online', label: 'Online' };
}

function isOnlineOrder(order) {
  return getOrderChannel(order).key === 'online';
}

function isPosOrder(order) {
  return getOrderChannel(order).key === 'pos';
}

module.exports = {
  getOrderChannel: getOrderChannel,
  isOnlineOrder: isOnlineOrder,
  isPosOrder: isPosOrder,
  parseOrderNotes: parseOrderNotes
};

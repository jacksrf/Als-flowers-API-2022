var moment = require('moment');

var LIST_FIELDS = {
  _id: 1,
  id: 1,
  name: 1,
  order_number: 1,
  customer: 1,
  total_price_usd: 1,
  updated_at: 1,
  processed_at: 1,
  note_attributes: 1,
  line_items: 1,
  printed_at: 1,
  printnode_job_id: 1,
  staff_status: 1,
  completed_at: 1,
  needs_arrangement: 1,
  source_name: 1
};

function parseOrderNotes(order) {
  var notes = {};
  if (!order.note_attributes || !Array.isArray(order.note_attributes)) {
    return notes;
  }
  for (var i = 0; i < order.note_attributes.length; i++) {
    var key = order.note_attributes[i].name.replace(/ /g, '_').replace(/-/g, '_').toLowerCase();
    notes[key] = order.note_attributes[i].value.toString();
  }
  return notes;
}

function lineItemNeedsArrangement(item) {
  if (!item) {
    return false;
  }
  if (item.product_type === 'Flowers') {
    return true;
  }
  if (!item.properties || !item.properties.length) {
    return false;
  }
  for (var i = 0; i < item.properties.length; i++) {
    var name = item.properties[i].name;
    if (name === 'Flower Notes' || name === 'Color Palatte' || name === 'Color Palette') {
      return true;
    }
  }
  return false;
}

function needsArrangement(order) {
  if (!order || !order.line_items || !order.line_items.length) {
    return false;
  }
  for (var i = 0; i < order.line_items.length; i++) {
    if (lineItemNeedsArrangement(order.line_items[i])) {
      return true;
    }
  }
  return false;
}

function normalizeDateForCompare(value) {
  if (!value) {
    return '';
  }
  return value.toString().replace(/-/g, '/');
}

function orderMatchesDay(order, dayFormatted) {
  var orderNotes = parseOrderNotes(order);
  if (orderNotes.checkout_method === 'delivery' && orderNotes.delivery_date) {
    if (normalizeDateForCompare(orderNotes.delivery_date) === dayFormatted) {
      return true;
    }
  }
  if (orderNotes.checkout_method === 'pickup' && orderNotes.pickup_date) {
    if (normalizeDateForCompare(orderNotes.pickup_date) === dayFormatted) {
      return true;
    }
  }
  return false;
}

function filterOrdersByDay(orders, dayFormatted) {
  var matched = [];
  for (var j = 0; j < orders.length; j++) {
    if (!orders[j].note_attributes || !orders[j].customer) {
      continue;
    }
    if (orderMatchesDay(orders[j], dayFormatted)) {
      matched.push(orders[j]);
    }
  }
  return dedupeOrdersById(matched);
}

function dedupeOrdersById(orders) {
  return Array.from(new Set(orders.map(function(a) { return a.id; })))
    .map(function(id) {
      return orders.find(function(a) { return a.id === id; });
    });
}

function getFulfillmentLabel(orderNotes) {
  if (!orderNotes || !orderNotes.checkout_method) {
    return '—';
  }
  if (orderNotes.checkout_method === 'delivery') {
    var d = orderNotes.delivery_date || '';
    return 'Delivery' + (d ? ' · ' + d : '');
  }
  if (orderNotes.checkout_method === 'pickup') {
    var p = orderNotes.pickup_date || '';
    return 'Pickup' + (p ? ' · ' + p : '');
  }
  return orderNotes.checkout_method;
}

function getFulfillmentParts(orderNotes) {
  if (!orderNotes || !orderNotes.checkout_method) {
    return { method: '—', date: '', time: '' };
  }
  if (orderNotes.checkout_method === 'delivery') {
    return {
      method: 'Delivery',
      date: orderNotes.delivery_date || '',
      time: orderNotes.delivery_time || ''
    };
  }
  if (orderNotes.checkout_method === 'pickup') {
    return {
      method: 'Pickup',
      date: orderNotes.pickup_date || '',
      time: orderNotes.pickup_time || ''
    };
  }
  return { method: orderNotes.checkout_method, date: '', time: '' };
}

function enrichOrderForList(order) {
  var orderNotes = parseOrderNotes(order);
  var fulfillment = getFulfillmentParts(orderNotes);

  order.orderNotes = orderNotes;
  if (order.needs_arrangement === undefined || order.needs_arrangement === null) {
    order.needs_arrangement = needsArrangement(order);
  }
  if (!order.staff_status) {
    order.staff_status = 'pending';
  }
  order.isComplete = order.staff_status === 'complete';
  order.fulfillmentLabel = getFulfillmentLabel(orderNotes);
  order.fulfillmentMethod = fulfillment.method;
  order.fulfillmentDate = fulfillment.date;
  order.fulfillmentTime = fulfillment.time;
  order.customerName = order.customer
    ? ((order.customer.first_name || '') + ' ' + (order.customer.last_name || '')).trim()
    : '—';
  order.totalDisplay = order.total_price_usd ? ('$' + order.total_price_usd) : '';
  if (order.updated_at) {
    order.updatedRelative = moment(order.updated_at).fromNow();
  }
  if (order.printed_at) {
    order.printedLabel = moment(order.printed_at).format('h:mm A');
    order.printedTitle = 'PrintNode job #' + (order.printnode_job_id || '');
    order.isPrinted = true;
  } else {
    order.isPrinted = false;
  }
  return order;
}

function summarizeOrders(orders) {
  var summary = {
    total: orders.length,
    arrangements: 0,
    other: 0,
    unprinted: 0,
    pending: 0,
    complete: 0
  };
  for (var i = 0; i < orders.length; i++) {
    if (orders[i].needs_arrangement) {
      summary.arrangements++;
    } else {
      summary.other++;
    }
    if (!orders[i].printed_at) {
      summary.unprinted++;
    }
    if (orders[i].staff_status === 'complete') {
      summary.complete++;
    } else {
      summary.pending++;
    }
  }
  return summary;
}

function enrichOrdersForList(orders) {
  return orders.map(enrichOrderForList);
}

function applyListFilter(orders, filter) {
  if (!filter || filter === 'all') {
    return orders;
  }
  if (filter === 'active') {
    return orders.filter(function(o) { return o.staff_status !== 'complete'; });
  }
  if (filter === 'complete') {
    return orders.filter(function(o) { return o.staff_status === 'complete'; });
  }
  if (filter === 'arrangement') {
    return orders.filter(function(o) { return o.needs_arrangement === true; });
  }
  if (filter === 'other') {
    return orders.filter(function(o) { return o.needs_arrangement !== true; });
  }
  return orders;
}

function persistOrderMetaOnInsert(db, doc, callback) {
  var ordersDB = db.get('orders');
  var id = doc._id;
  var updates = {
    needs_arrangement: needsArrangement(doc),
    staff_status: 'pending'
  };
  ordersDB.update({ _id: id }, { $set: updates }, callback);
}

module.exports = {
  LIST_FIELDS: LIST_FIELDS,
  parseOrderNotes: parseOrderNotes,
  needsArrangement: needsArrangement,
  orderMatchesDay: orderMatchesDay,
  filterOrdersByDay: filterOrdersByDay,
  dedupeOrdersById: dedupeOrdersById,
  enrichOrderForList: enrichOrderForList,
  enrichOrdersForList: enrichOrdersForList,
  summarizeOrders: summarizeOrders,
  applyListFilter: applyListFilter,
  persistOrderMetaOnInsert: persistOrderMetaOnInsert
};

var moment = require('moment');
var orderChannel = require('./orderChannel');

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
  print_status: 1,
  print_error: 1,
  print_submitted_at: 1,
  staff_status: 1,
  completed_at: 1,
  needs_arrangement: 1,
  source_name: 1
};

function normalizeKey(name) {
  return (name || '').toString().toLowerCase().replace(/[\s\-]+/g, '_');
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined) {
    return false;
  }
  return String(value).trim() !== '';
}

function parseOrderNotes(order) {
  var notes = {};
  if (!order.note_attributes || !Array.isArray(order.note_attributes)) {
    return notes;
  }
  for (var i = 0; i < order.note_attributes.length; i++) {
    var attr = order.note_attributes[i];
    if (!attr || !attr.name) {
      continue;
    }
    var key = normalizeKey(attr.name);
    notes[key] = attr.value === null || attr.value === undefined ? '' : attr.value.toString();
  }
  return notes;
}

function orderNotesNeedArrangement(orderNotes) {
  if (!orderNotes) {
    return false;
  }
  var keys = Object.keys(orderNotes);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var norm = normalizeKey(key);
    var value = orderNotes[key];
    if (!hasMeaningfulValue(value)) {
      continue;
    }
    if (norm === 'flower_notes' || norm === 'colors' || norm === 'color_palette' || norm === 'color_palatte') {
      return true;
    }
    if (norm.indexOf('flower') !== -1 && norm.indexOf('note') !== -1) {
      return true;
    }
    if (norm.indexOf('color') !== -1 && norm.indexOf('pal') !== -1) {
      return true;
    }
  }
  return false;
}

function propertyIndicatesArrangement(prop) {
  if (!prop || !prop.name) {
    return false;
  }
  if (!hasMeaningfulValue(prop.value)) {
    return false;
  }
  var norm = normalizeKey(prop.name);
  if (norm === 'flower_notes' || norm === 'colors' || norm === 'color_palette' || norm === 'color_palatte') {
    return true;
  }
  if (prop.name === 'Flower Notes' || prop.name === 'Color Palatte' || prop.name === 'Color Palette') {
    return true;
  }
  if (norm.indexOf('flower') !== -1 && norm.indexOf('note') !== -1) {
    return true;
  }
  if (norm.indexOf('color') !== -1 && norm.indexOf('pal') !== -1) {
    return true;
  }
  return false;
}

function lineItemNeedsArrangement(item) {
  if (!item) {
    return false;
  }
  var productType = (item.product_type || '').toString().toLowerCase();
  if (productType === 'flowers') {
    return true;
  }
  var props = item.properties;
  if (!props) {
    return false;
  }
  if (Array.isArray(props)) {
    for (var i = 0; i < props.length; i++) {
      if (propertyIndicatesArrangement(props[i])) {
        return true;
      }
    }
  }
  return false;
}

function needsArrangement(order) {
  if (!order) {
    return false;
  }
  var orderNotes = parseOrderNotes(order);
  if (orderNotesNeedArrangement(orderNotes)) {
    return true;
  }
  if (!order.line_items || !order.line_items.length) {
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

function persistNeedsArrangementIfChanged(db, orderId, stored, computed) {
  if (!db || !orderId || stored === computed) {
    return;
  }
  setImmediate(function() {
    db.get('orders').update({ _id: orderId }, { $set: { needs_arrangement: computed } }, function(err) {
      if (err) {
        console.log('Failed to persist needs_arrangement:', err);
      }
    });
  });
}

function enrichOrderForList(order, db) {
  var orderNotes = parseOrderNotes(order);
  var fulfillment = getFulfillmentParts(orderNotes);
  var storedArrangement = order.needs_arrangement;

  order.orderNotes = orderNotes;
  order.needs_arrangement = needsArrangement(order);
  persistNeedsArrangementIfChanged(db, order._id, storedArrangement, order.needs_arrangement);

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
  var channel = orderChannel.getOrderChannel(order);
  order.channelKey = channel.key;
  order.channelLabel = channel.label;
  order.totalDisplay = order.total_price_usd ? ('$' + order.total_price_usd) : '';
  if (order.updated_at) {
    order.updatedRelative = moment(order.updated_at).fromNow();
  }
  order.isPrinted = false;
  order.isPrintQueued = false;
  order.isPrintFailed = false;
  order.printedLabel = 'Not printed';
  order.printedTitle = '';

  if (order.printed_at && order.print_status !== 'error' && order.print_status !== 'expired') {
    order.printedLabel = moment(order.printed_at).format('h:mm A');
    order.printedTitle = 'PrintNode job #' + (order.printnode_job_id || '') + ' — printed';
    order.isPrinted = true;
  } else if (order.print_status === 'error' || order.print_status === 'expired') {
    order.printedLabel = 'Print failed';
    order.printedTitle = (order.print_error || order.print_status) + (order.printnode_job_id ? ' (job #' + order.printnode_job_id + ')' : '');
    order.isPrintFailed = true;
  } else if (order.printnode_job_id && (order.print_status === 'queued' || !order.print_status)) {
    order.printedLabel = 'Sending…';
    order.printedTitle = 'PrintNode job #' + order.printnode_job_id + ' — waiting for printer';
    order.isPrintQueued = true;
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

function enrichOrdersForList(orders, db) {
  return orders.map(function(order) {
    return enrichOrderForList(order, db);
  });
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

function backfillNeedsArrangement(db, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  var limit = options.limit || 1000;
  var ordersDB = db.get('orders');
  ordersDB.find({}, {
    limit: limit,
    sort: { processed_at: -1 },
    fields: LIST_FIELDS
  }, function(err, orders) {
    if (err) {
      return callback(err);
    }
    var updated = 0;
    var arrangements = 0;
    var pending = orders.length;
    if (!pending) {
      return callback(null, { scanned: 0, updated: 0, arrangements: 0 });
    }
    for (var i = 0; i < orders.length; i++) {
      (function(order) {
        var computed = needsArrangement(order);
        if (computed) {
          arrangements++;
        }
        if (order.needs_arrangement === computed) {
          if (--pending === 0) {
            callback(null, { scanned: orders.length, updated: updated, arrangements: arrangements });
          }
          return;
        }
        ordersDB.update({ _id: order._id }, { $set: { needs_arrangement: computed } }, function(updateErr) {
          if (!updateErr) {
            updated++;
          }
          if (--pending === 0) {
            callback(null, { scanned: orders.length, updated: updated, arrangements: arrangements });
          }
        });
      })(orders[i]);
    }
  });
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
  persistOrderMetaOnInsert: persistOrderMetaOnInsert,
  backfillNeedsArrangement: backfillNeedsArrangement
};

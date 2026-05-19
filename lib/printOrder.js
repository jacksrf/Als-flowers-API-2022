var webshot = require('webshot-node');
var request = require('request');
var moment = require('moment');
var orderMeta = require('./orderMeta');

var ADMIN_BASE_URL = process.env.ADMIN_BASE_URL || 'https://admin.alsflowersmontgomery.com';
var API_BASE_URL = process.env.API_BASE_URL || 'https://api.alsflowersmontgomery.com';
var DEFAULT_PRINTER_ID = parseInt(process.env.PRINTNODE_PRINTER_ID || '74798829', 10);
var PRINTNODE_API_KEY = process.env.PRINTNODE_API_KEY;

if (!PRINTNODE_API_KEY) {
  console.error('WARN: PRINTNODE_API_KEY is not set; PrintNode submissions will fail until it is configured.');
}

var POLL_INTERVAL_MS = 2500;
var POLL_MAX_ATTEMPTS = 120;
var RECONCILE_INTERVAL_MS = 60000;

var queue = [];
var running = false;
var activePolls = {};

function orderIdString(doc) {
  if (!doc || !doc._id) {
    return '';
  }
  return doc._id.toString ? doc._id.toString() : doc._id;
}

function hasNoteAttributes(doc) {
  return doc && doc.note_attributes && Array.isArray(doc.note_attributes);
}

function prepareOrderDoc(doc, nl2br) {
  if (!hasNoteAttributes(doc)) {
    return;
  }
  if (doc.note) {
    doc.note = nl2br(doc.note);
  }
  doc.deliver_day = '';
  if (!doc.user_id) {
    doc.user_id = '';
  }
  doc.orderNotes = {};
  for (var i = 0; i < doc.note_attributes.length; i++) {
    var key = doc.note_attributes[i].name.replace(/ /g, '_').replace(/-/g, '_').toLowerCase();
    doc.orderNotes[key] = doc.note_attributes[i].value.toString();
  }
}

function shouldPrint(doc, nl2br) {
  if (!hasNoteAttributes(doc) || doc.note_attributes[1] === undefined) {
    return false;
  }
  if (!doc.orderNotes || Object.keys(doc.orderNotes).length === 0) {
    prepareOrderDoc(doc, nl2br);
  }
  return doc.orderNotes.checkout_method === 'delivery' || doc.orderNotes.checkout_method === 'pickup';
}

function webhookAck(res) {
  if (!res.headersSent) {
    res.status(200).send('ok');
  }
}

function getWebshotOptions() {
  return {
    screenSize: {
      width: 1350,
      height: 2200
    },
    phantomPath: require('phantomjs2').path,
    phantomConfig: { 'ignore-ssl-errors': 'true' }
  };
}

function printNodeAuthHeader() {
  return {
    Authorization: 'Basic ' + Buffer.from((PRINTNODE_API_KEY || '') + ':').toString('base64')
  };
}

function parseJobId(body) {
  if (body === null || body === undefined) {
    return null;
  }
  if (typeof body === 'number') {
    return body;
  }
  if (typeof body === 'string') {
    var trimmed = body.trim();
    if (/^\d+$/.test(trimmed)) {
      return parseInt(trimmed, 10);
    }
    return null;
  }
  if (typeof body === 'object') {
    return body.id || body.printJobId || body.jobId || null;
  }
  return null;
}

function flattenStates(body) {
  var flat = [];
  if (!body || !Array.isArray(body)) {
    return flat;
  }
  for (var i = 0; i < body.length; i++) {
    if (Array.isArray(body[i])) {
      for (var j = 0; j < body[i].length; j++) {
        flat.push(body[i][j]);
      }
    } else if (body[i]) {
      flat.push(body[i]);
    }
  }
  return flat;
}

function getLatestState(states) {
  var latest = null;
  for (var i = 0; i < states.length; i++) {
    var s = states[i];
    if (!s || !s.state) {
      continue;
    }
    if (!latest) {
      latest = s;
      continue;
    }
    var sTime = s.createTimestamp ? new Date(s.createTimestamp).getTime() : 0;
    var lTime = latest.createTimestamp ? new Date(latest.createTimestamp).getTime() : 0;
    if (sTime >= lTime) {
      latest = s;
    }
  }
  return latest;
}

function fetchPrintJobStates(jobId, done) {
  request.get({
    url: 'https://api.printnode.com/printjobs/' + jobId + '/states',
    headers: printNodeAuthHeader(),
    json: true
  }, function(error, response, body) {
    if (error) {
      return done(error);
    }
    if (!response || response.statusCode >= 400) {
      return done(new Error('PrintNode states HTTP ' + (response && response.statusCode)));
    }
    done(null, flattenStates(body));
  });
}

function recordPrintSubmitted(db, doc, jobId, done) {
  if (!db || !doc || !doc._id) {
    if (done) {
      done();
    }
    return;
  }
  db.get('orders').update({ _id: doc._id }, {
    $set: {
      printnode_job_id: jobId,
      print_submitted_at: new Date(),
      print_status: 'queued',
      print_error: null
    },
    $unset: { printed_at: '' }
  }, function(err) {
    if (err) {
      console.log('Failed to save print submission:', err);
    }
    if (done) {
      done(err);
    }
  });
}

function recordPrintDone(db, doc, jobId, stateObj, done) {
  if (!db || !doc || !doc._id) {
    if (done) {
      done();
    }
    return;
  }
  db.get('orders').update({ _id: doc._id }, {
    $set: {
      printed_at: new Date(),
      print_status: 'done',
      printnode_job_id: jobId,
      print_error: null
    }
  }, function(err) {
    if (err) {
      console.log('Failed to save print done status:', err);
    } else {
      console.log('PrintNode job ' + jobId + ' done for order #' + doc.order_number);
    }
    if (done) {
      done(err);
    }
  });
}

function recordPrintFailed(db, doc, jobId, status, message, done) {
  if (!db || !doc || !doc._id) {
    if (done) {
      done();
    }
    return;
  }
  db.get('orders').update({ _id: doc._id }, {
    $set: {
      print_status: status,
      print_error: message || status,
      printnode_job_id: jobId
    },
    $unset: { printed_at: '' }
  }, function(err) {
    if (err) {
      console.log('Failed to save print failure:', err);
    } else {
      console.log('PrintNode job ' + jobId + ' ' + status + ' for order #' + doc.order_number + ': ' + (message || ''));
    }
    if (done) {
      done(err);
    }
  });
}

function pollKey(doc, jobId) {
  return orderIdString(doc) + ':' + jobId;
}

function clearPoll(key) {
  delete activePolls[key];
}

function pollPrintJobStatus(db, doc, jobId, attempt, done) {
  var key = pollKey(doc, jobId);
  if (!activePolls[key]) {
    activePolls[key] = true;
  }

  fetchPrintJobStates(jobId, function(err, states) {
    if (err) {
      clearPoll(key);
      if (done) {
        done(err);
      }
      return;
    }

    var latest = getLatestState(states);
    var stateName = latest && latest.state;

    if (stateName === 'done') {
      clearPoll(key);
      return recordPrintDone(db, doc, jobId, latest, done);
    }

    if (stateName === 'error' || stateName === 'expired') {
      clearPoll(key);
      return recordPrintFailed(db, doc, jobId, stateName, latest && latest.message, done);
    }

    if (attempt >= POLL_MAX_ATTEMPTS) {
      clearPoll(key);
      console.log('PrintNode job ' + jobId + ' poll timeout (last state: ' + (stateName || 'unknown') + ')');
      if (done) {
        done(new Error('Print status poll timeout'));
      }
      return;
    }

    setTimeout(function() {
      pollPrintJobStatus(db, doc, jobId, attempt + 1, done);
    }, POLL_INTERVAL_MS);
  });
}

function watchPrintJob(db, doc, jobId, done) {
  var key = pollKey(doc, jobId);
  if (activePolls[key]) {
    if (done) {
      done();
    }
    return;
  }
  activePolls[key] = true;
  pollPrintJobStatus(db, doc, jobId, 0, function(err) {
    clearPoll(key);
    if (done) {
      done(err);
    }
  });
}

function submitPrintNode(doc, db, options, done) {
  var id = orderIdString(doc);
  var pdfUrl = API_BASE_URL + '/pdf/' + id + '.pdf';
  if (options.cacheBust) {
    pdfUrl += '?t=' + Math.random();
  }

  var formData = {
    printer: options.printerId || DEFAULT_PRINTER_ID,
    title: 'Order: ' + doc.order_number,
    contentType: 'pdf_uri',
    content: pdfUrl,
    source: 'api documentation!',
    options: {
      paper: 'Legal (8.5 x 14 in)'
    }
  };

  request.post({
    url: 'https://api.printnode.com/printjobs',
    headers: printNodeAuthHeader(),
    json: true,
    body: formData
  }, function(error, response, body) {
    if (error) {
      console.log(error);
      if (done) {
        done(error);
      }
      return;
    }

    if (!response || response.statusCode < 200 || response.statusCode >= 300) {
      console.log('PrintNode submit failed:', response && response.statusCode, body);
      if (done) {
        done(new Error('PrintNode submit HTTP ' + (response && response.statusCode)));
      }
      return;
    }

    var jobId = parseJobId(body);
    if (!jobId) {
      console.log('PrintNode submit: no job id in response', body);
      if (done) {
        done(new Error('PrintNode returned no job id'));
      }
      return;
    }

    console.log(moment().format('MMMM Do YYYY, h:mm a'));
    var label = options.logLabel || 'NEW ORDER';
    console.log(label + '#:' + doc.order_number + ' → PrintNode job ' + jobId);

    recordPrintSubmitted(db, doc, jobId, function(saveErr) {
      if (saveErr) {
        if (done) {
          done(saveErr);
        }
        return;
      }
      watchPrintJob(db, doc, jobId, done);
    });
  });
}

function runPrintJob(doc, db, options, done) {
  var id = orderIdString(doc);
  var pdfPath = './public/pdf/' + id + '.pdf';
  var adminUrl = ADMIN_BASE_URL + '/order/pdf/' + id;

  webshot(adminUrl, pdfPath, getWebshotOptions(), function(err) {
    console.log(err);
    if (err) {
      if (done) {
        done(err);
      }
      return;
    }

    var sendToPrinter = function() {
      submitPrintNode(doc, db, options, done);
    };

    if (options.reprintDelay) {
      setTimeout(sendToPrinter, options.reprintDelay);
    } else {
      sendToPrinter();
    }
  });
}

function processQueue() {
  if (running || queue.length === 0) {
    return;
  }

  running = true;
  var item = queue.shift();

  runPrintJob(item.doc, item.db, item.options, function(err) {
    running = false;
    if (item.callback) {
      item.callback(err);
    }
    processQueue();
  });
}

function enqueuePrint(doc, db, options, callback) {
  queue.push({
    doc: doc,
    db: db,
    options: options || {},
    callback: callback
  });
  processQueue();
}

function finishWebhookWithPrint(doc, db, res, nl2br) {
  if (!hasNoteAttributes(doc)) {
    console.log('WARN: order missing note_attributes', doc && doc.name);
    webhookAck(res);
    return;
  }

  prepareOrderDoc(doc, nl2br);
  orderMeta.persistOrderMetaOnInsert(db, doc, function() {
    webhookAck(res);

    if (shouldPrint(doc, nl2br)) {
      setImmediate(function() {
        enqueuePrint(doc, db, { logLabel: 'NEW ORDER' });
      });
    }
  });
}

function syncOrderPrintStatus(db, doc, done) {
  if (!doc || !doc.printnode_job_id) {
    if (done) {
      done();
    }
    return;
  }
  if (doc.printed_at && doc.print_status === 'done') {
    if (done) {
      done();
    }
    return;
  }
  watchPrintJob(db, doc, doc.printnode_job_id, done);
}

function reconcilePendingPrints(db, done) {
  if (!db) {
    if (done) {
      done();
    }
    return;
  }

  db.get('orders').find({
    printnode_job_id: { $exists: true, $ne: null },
    $and: [
      {
        $or: [
          { print_status: 'queued' },
          { print_status: { $exists: false } }
        ]
      },
      {
        $or: [
          { printed_at: { $exists: false } },
          { printed_at: null }
        ]
      }
    ]
  }, {
    fields: { _id: 1, order_number: 1, printnode_job_id: 1, print_status: 1, printed_at: 1 },
    limit: 50
  }, function(err, orders) {
    if (err) {
      console.log('reconcilePendingPrints find error:', err);
      if (done) {
        done(err);
      }
      return;
    }
    if (!orders || !orders.length) {
      if (done) {
        done();
      }
      return;
    }

    console.log('Reconciling ' + orders.length + ' pending PrintNode job(s)');
    var pending = orders.length;
    var finished = function() {
      pending--;
      if (pending <= 0 && done) {
        done();
      }
    };

    for (var i = 0; i < orders.length; i++) {
      syncOrderPrintStatus(db, orders[i], finished);
    }
  });
}

var reconcilerStarted = false;

function startPendingPrintReconciler(db) {
  if (reconcilerStarted || !db) {
    return;
  }
  reconcilerStarted = true;

  setImmediate(function() {
    reconcilePendingPrints(db);
  });

  setInterval(function() {
    reconcilePendingPrints(db);
  }, RECONCILE_INTERVAL_MS);
}

module.exports = {
  hasNoteAttributes: hasNoteAttributes,
  prepareOrderDoc: prepareOrderDoc,
  shouldPrint: shouldPrint,
  webhookAck: webhookAck,
  enqueuePrint: enqueuePrint,
  finishWebhookWithPrint: finishWebhookWithPrint,
  runPrintJob: runPrintJob,
  syncOrderPrintStatus: syncOrderPrintStatus,
  reconcilePendingPrints: reconcilePendingPrints,
  startPendingPrintReconciler: startPendingPrintReconciler,
  printNodeAuthHeader: printNodeAuthHeader,
  flattenStates: flattenStates,
  getLatestState: getLatestState,
  fetchPrintJobStates: fetchPrintJobStates,
  recordPrintDone: recordPrintDone,
  recordPrintFailed: recordPrintFailed
};

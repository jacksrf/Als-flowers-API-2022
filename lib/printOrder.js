var webshot = require('webshot-node');
var request = require('request');
var moment = require('moment');

var ADMIN_BASE_URL = 'https://admin.alsflowersmontgomery.com';
var API_BASE_URL = 'https://api.alsflowersmontgomery.com';
var DEFAULT_PRINTER_ID = 74798829;
var PRINTNODE_API_KEY = '7qPBLc9mtxCwF1vc53b4c774OhS5CbRMZfoxN3jy78A';

var queue = [];
var running = false;

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

function submitPrintNode(doc, options, done) {
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

  var auth = 'Basic ' + new Buffer(PRINTNODE_API_KEY + ':').toString('base64');

  request.post({
    url: 'https://api.printnode.com/printjobs',
    headers: {
      Authorization: auth
    },
    json: true,
    body: formData
  }, function(error) {
    if (error) {
      console.log(error);
    } else {
      console.log(moment().format('MMMM Do YYYY, h:mm a'));
      var label = options.logLabel || 'NEW ORDER';
      console.log(label + '#:' + doc.order_number);
    }
    if (done) {
      done(error);
    }
  });
}

function runPrintJob(doc, options, done) {
  var id = orderIdString(doc);
  var pdfPath = './public/pdf/' + id + '.pdf';
  var adminUrl = ADMIN_BASE_URL + '/order/pdf/' + id;

  webshot(adminUrl, pdfPath, getWebshotOptions(), function(err) {
    console.log(err);

    var sendToPrinter = function() {
      submitPrintNode(doc, options, done);
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

  runPrintJob(item.doc, item.options, function(err) {
    running = false;
    if (item.callback) {
      item.callback(err);
    }
    processQueue();
  });
}

function enqueuePrint(doc, options, callback) {
  queue.push({
    doc: doc,
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
  webhookAck(res);

  if (shouldPrint(doc, nl2br)) {
    setImmediate(function() {
      enqueuePrint(doc, { logLabel: 'NEW ORDER' });
    });
  }
}

module.exports = {
  hasNoteAttributes: hasNoteAttributes,
  prepareOrderDoc: prepareOrderDoc,
  shouldPrint: shouldPrint,
  webhookAck: webhookAck,
  enqueuePrint: enqueuePrint,
  finishWebhookWithPrint: finishWebhookWithPrint,
  runPrintJob: runPrintJob
};

var express = require('express');
var router = express.Router();
// var rest = require('restler');
var fs = require('fs');
// var pdf = require('html-pdf');
var request = require('request');
// var jsPDF = require('jspdf');
// var cheerio = require('cheerio')
// var htmlToImage = require('html-to-image');
var webshot = require('webshot-node');
var moment = require('moment');
var nl2br = require('nl2br');
var printOrder = require('../lib/printOrder');
var orderMeta = require('../lib/orderMeta');

var multipart = require('connect-multiparty');
var multipartMiddleware = multipart();

var passport = require('passport');
var express = require('express');
var router = express.Router();
var mongo = require('mongodb')
// var fetch = require("node-fetch");

var SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
var SHOPIFY_API_PASSWORD = process.env.SHOPIFY_API_PASSWORD;
var SHOPIFY_STORE = process.env.SHOPIFY_STORE || 'als-flowers';
var SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2021-01';

function shopifyAuthHeader() {
  if (!SHOPIFY_API_KEY || !SHOPIFY_API_PASSWORD) {
    console.warn('Shopify API credentials not set; SHOPIFY_API_KEY / SHOPIFY_API_PASSWORD env vars are required.');
    return null;
  }
  return 'Basic ' + Buffer.from(SHOPIFY_API_KEY + ':' + SHOPIFY_API_PASSWORD).toString('base64');
}

function shopifyApiUrl(path) {
  return 'https://' + SHOPIFY_STORE + '.myshopify.com/admin/api/' + SHOPIFY_API_VERSION + path;
}

router.use(function(req, res, next) {
  next();
});

function parseOrderId(id) {
  try {
    return mongo.ObjectID(id);
  } catch (e) {
    return id;
  }
}

function renderOrdersPage(req, res, options) {
  var enriched = orderMeta.enrichOrdersForList(options.orders || [], req.db);
  var filter = req.query.filter || options.defaultFilter || 'active';
  var orders = orderMeta.applyListFilter(enriched, filter);
  var view = options.view || 'orders';
  var listBaseUrl = options.listBaseUrl;
  if (!listBaseUrl) {
    if (view === 'orders-today') {
      listBaseUrl = '/orders/today';
    } else if (view === 'orders-tomorrow') {
      listBaseUrl = '/orders/tomorrow';
    } else {
      listBaseUrl = '/orders';
    }
  }
  res.render(view, {
    orders: orders,
    moment: moment,
    filter: filter,
    summary: orderMeta.summarizeOrders(enriched),
    pageTitle: options.pageTitle || 'Orders',
    pageSubtitle: options.pageSubtitle || '',
    showDateSearch: options.showDateSearch !== false,
    listBaseUrl: listBaseUrl,
    currentNav: req.path,
    date: options.date
  });
}

function fetchOrdersList(db, findQuery, sortLimit, callback) {
  var ordersDB = db.get('orders');
  var query = findQuery || {};
  var opts = sortLimit || { limit: 500, sort: { processed_at: -1 } };
  ordersDB.find(query, {
    limit: opts.limit,
    sort: opts.sort,
    fields: orderMeta.LIST_FIELDS
  }, function(err, orders) {
    if (err) {
      return callback(err);
    }
    callback(null, orderMeta.dedupeOrdersById(orders));
  });
}

// app/routes.js
// root with login links



// router.get('/shop-info', function(req, res, next) {
//   fetch("https://als-flowers.myshopify.com/admin/api/graphql.json", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       "X-Shopify-Access-Token": "d09c6913dbb3dc5fe4dc93f5f9ecb504"
//     },
//     body: JSON.stringify({
//       query: `{
//          shop {
//            name
//            url
//            email
//            myshopifyDomain
//          }
//        }`
//     })
//   })
//     .then(result => {
//       return result.json();
//     })
//     .then(data => {
//       console.log("data returned:\n", data);
//       res.send(data);
//     });
// })

router.get('/login', function(req, res, next) {
  res.render('login')
});

router.get('/signup', isSuperAdmin, isLoggedIn, function(req, res, next) {
  res.render('signup')
});

router.get('/profile', function(req, res) {
  if (req.user) {
    res.render('profile', {
      user: req.user
    });
  } else {
    res.redirect('/login');
  }
});
router.get('/logout', function(req, res) {
  req.logout();
  res.redirect('/');
});
router.post('/signup', function(req, res, next) {
  // console.log(req.body)
  passport.authenticate('local-signup',
    function(err, user, info) {
      if (err) {
        return next(err);
      }
      if (!user) {
        req.flash('info', info.message);
        return res.redirect('/admin/signup')
      }
      req.flash('info', info.message);
      res.redirect('/admin/home');
    })(req, res, next);
});
router.post('/login', function(req, res, next) {
  passport.authenticate('local-login',
    function(err, user, info) {
      if (err) {
        return next(err);
      }
      if (!user) {
        req.flash('info', info.message);
        return res.redirect('/login');
      }
      req.logIn(user, function(err) {
        if (err) {
          return next(err);
        }
        // console.log(req.user.local.email)
        return res.redirect('/orders');

      });
    })(req, res, next);
});

router.get('/logout', function(req, res) {
  req.session.destroy(function(err) {
    res.redirect('/login'); //Inside a callback… bulletproof!
  });
});

router.get('/', isLoggedIn, function(req, res, next) {
  res.redirect('/orders')
});

router.get('/orders', isLoggedIn, function(req, res, next) {
  fetchOrdersList(req.db, {}, { limit: 500, sort: { processed_at: -1 } }, function(err, orders) {
    if (err) {
      console.log(err);
      return next(err);
    }
    renderOrdersPage(req, res, {
      orders: orders,
      defaultFilter: 'active',
      pageTitle: 'Orders',
      pageSubtitle: 'Recent orders'
    });
  });
});

router.get('/orders/today', isLoggedIn, function(req, res, next) {
  var today = moment().format('YYYY/MM/DD').toString();
  fetchOrdersList(req.db, {}, { limit: 1000, sort: { _id: -1 } }, function(err, orders) {
    if (err) {
      console.log(err);
      return next(err);
    }
    var filtered = orderMeta.filterOrdersByDay(orders, today);
    renderOrdersPage(req, res, {
      orders: filtered,
      view: 'orders-today',
      defaultFilter: 'all',
      pageTitle: "Today's orders",
      pageSubtitle: moment().format('dddd, MMM D, YYYY'),
      showDateSearch: false
    });
  });
});

router.get('/orders/tomorrow', isLoggedIn, function(req, res, next) {
  var tomorrow = moment().add(1, 'days').format('YYYY/MM/DD').toString();
  fetchOrdersList(req.db, {}, { limit: 2000, sort: { _id: -1 } }, function(err, orders) {
    if (err) {
      console.log(err);
      return next(err);
    }
    var filtered = orderMeta.filterOrdersByDay(orders, tomorrow);
    renderOrdersPage(req, res, {
      orders: filtered,
      view: 'orders-tomorrow',
      defaultFilter: 'all',
      pageTitle: "Tomorrow's orders",
      pageSubtitle: moment().add(1, 'days').format('dddd, MMM D, YYYY'),
      showDateSearch: false
    });
  });
});

router.post('/orders-by-day/:day', isLoggedIn, function(req, res, next) {
  var day = decodeURI(req.params.day);
  var dayFormatted = moment(day).format('YYYY/MM/DD').toString();
  fetchOrdersList(req.db, {}, { limit: 1000, sort: { _id: -1 } }, function(err, orders) {
    if (err) {
      console.log(err);
      return next(err);
    }
    var filtered = orderMeta.filterOrdersByDay(orders, dayFormatted);
    renderOrdersPage(req, res, {
      orders: filtered,
      view: 'orders-random-day',
      defaultFilter: 'all',
      pageTitle: 'Orders for ' + moment(day).format('MM/DD/YYYY'),
      pageSubtitle: '',
      showDateSearch: false,
      date: moment(day).format('MM/DD/YYYY')
    });
  });
});

router.post('/orders/search', isLoggedIn, function(req, res, next) {
  var order = req.body.order;
  var order_number = '#' + order;
  var findQuery = {};
  if (order !== '') {
    findQuery = {
      $or: [{
        name: order_number
      }, {
        'customer.first_name': new RegExp('^' + order + '$', 'i')
      }]
    };
  }
  fetchOrdersList(req.db, findQuery, { limit: 500, sort: { processed_at: -1 } }, function(err, orders) {
    if (err) {
      console.log(err);
      return next(err);
    }
    renderOrdersPage(req, res, {
      orders: orders,
      defaultFilter: 'all',
      pageTitle: order ? 'Search results' : 'Orders',
      pageSubtitle: order ? ('Matching "' + order + '"') : 'Recent orders'
    });
  });
});

// '01/05/2021, Local Delivery, Local Delivery Order'
// '01/04/2021, 16:00, Pickup Order'

router.get('/subscriptions', function(req, res, next) {
  // "source_name": "subscription_contract",
  var db = req.db;
  var ordersDB = db.get('orders')
  ordersDB.find({
    "source_name": 'subscription_contract'
  }, {}, function(err, docs) {
    // console.log(docs.length)
    var ordersClean = Array.from(new Set(docs.map(a => a.id)))
      .map(id => {
        return docs.find(a => a.id === id)
      })
    for (i = 0; i < ordersClean.length; i++) {
      // console.log(ordersClean[i].name)
    }
    res.send()
  })
})

router.post('/new2/order', function(req, res) {
  console.log('POST /new2/order deprecated — use POST /new/order');
  res.status(410).send('deprecated — use POST /new/order');
});



router.post('/order/:id/status', isLoggedIn, function(req, res, next) {
  var db = req.db;
  var ordersDB = db.get('orders');
  var status = (req.body && req.body.status) || 'complete';
  var queryId = parseOrderId(req.params.id);
  var updates = {};

  var updateOp;
  if (status === 'complete') {
    updateOp = {
      $set: {
        staff_status: 'complete',
        completed_at: new Date()
      }
    };
  } else {
    updateOp = {
      $set: { staff_status: 'pending' },
      $unset: { completed_at: '' }
    };
  }

  ordersDB.update({ _id: queryId }, updateOp, function(err, count) {
    if (err) {
      console.log(err);
      return res.status(500).json({ ok: false, error: 'update failed' });
    }
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') !== -1)) {
      return res.json({ ok: true, status: status === 'complete' ? 'complete' : 'pending' });
    }
    res.redirect(req.get('Referer') || '/orders');
  });
});

router.get('/order/reprint/pdf/:id', isLoggedIn, function(req, res, next) {
  var id = req.params.id;
  var db = req.db;
  var ordersDB = db.get('orders');
  var responded = false;

  function renderPrintResult(message) {
    if (responded) {
      return;
    }
    responded = true;
    console.log('REPRINT RESULT: ' + message);
    res.render('index', { message: message });
  }

  var queryId = id;
  try {
    queryId = mongo.ObjectID(id);
  } catch (objectIdErr) {
    console.log('REPRINT invalid id: ' + id);
  }

  console.log('REPRINT start: ' + id);
  ordersDB.findOne({ '_id': queryId }, {}, function(err, doc) {
    if (err) {
      console.log(err);
      return renderPrintResult('THERE WAS AN ISSUE PRINTING, LET TREY KNOW IMMEDIATELY');
    }
    if (!doc || !printOrder.hasNoteAttributes(doc) || doc.note_attributes[1] === undefined) {
      console.log('REPRINT cannot print order: ' + id);
      return renderPrintResult('ORDER NOT FOUND OR MISSING CHECKOUT DETAILS — CANNOT PRINT.');
    }

    console.log('REPRINT queued for order #' + doc.order_number);
    printOrder.enqueuePrint(doc, db, {
      logLabel: 'REPRINT',
      cacheBust: true,
      reprintDelay: 4000
    }, function(printErr) {
      if (printErr) {
        return renderPrintResult('THERE WAS AN ISSUE PRINTING, LET TREY KNOW IMMEDIATELY');
      }
      renderPrintResult('PRINTED SUCCESSFULLY — ORDER MARKED AS PRINTED.');
    });
  });
})

router.get('/order/json/:id', function(req, res, next) {
  var id = req.params.id;
  var db = req.db;
  var ordersDB = db.get('orders')
  // if (key != undefined) {
  ordersDB.findOne({
    "_id": id
  }, {}, function(err, doc) {
    res.send(doc)
  })
});

router.post('/order/update', function(req, res, next) {
  // console.log(req.body)
  var db = req.db;
  var ordersDB = db.get('orders')
  var order_number = req.body.name;
  // console.log(order_number)
  ordersDB.findOneAndUpdate({
    "name": order_number
  }, {
    $set: req.body
  }, {
    upsert: true,
    setDefaultsOnInsert: true
  }, function(err, doc) {
    if (err) {
      console.log(err)

      res.send()
    } else {
      if (!doc) {
        // Create it
        res.redirect(307, '/new/order');
      } else {
        // console.log(doc)
        res.send()
      }

    }
  })
});

router.get('/order/edit/:id', isLoggedIn, multipartMiddleware, function(req, res, next) {

  var id = req.params.id;
  // var filename  = './'+ id +'.pdf';
  // console.log(id);
  var db = req.db;
  var ordersDB = db.get('orders')
  ordersDB.findOne({
    "_id": id
  }, {}, function(err, doc) {
    // console.log(doc.note)
    // console.log(doc.note_attributes.length);
    // console.log(doc)
    res.render('order-edit', {
      "order": doc
    })
  })

})
//
router.post('/order/edit/:id', isLoggedIn, multipartMiddleware, function(req, res, next) {
  // console.log(req.body)
  var id = req.params.id;
  // // var filename  = './'+ id +'.pdf';
  var form = req.body.note_attributes
  // console.log(id);
  // console.log(form)
  var newNoteAttributes = [];
  var newNote = ''

  function callback() {
    console.log('all done');
    // console.log(newNoteAttributes)
    var db = req.db;
    var ordersDB = db.get('orders')
    ordersDB.update({
      "_id": id
    }, {
      $set: {
        "note_attributes": newNoteAttributes,
        "shipping_address": req.body.shipping_address,
        "note": req.body.note
      }
    }, function(err, doc) {
      // console.log(doc)
      res.redirect('/order/save/confirmation/' + id)
    })
  }
  var itemsProcessed = 0;
  Object.entries(form).forEach(
    ([key, value]) => {
      // console.log(key, value)
      if (key === 'note') {
        newNote = value
        console.log("note: " + newNote)
        itemsProcessed++;
        if (itemsProcessed === Object.entries(form).length) {
          callback();
        }
      } else {
        var item = {
          name: key,
          value: value
        }
        // console.log(item)
        newNoteAttributes.push(item)
        itemsProcessed++;
        if (itemsProcessed === Object.entries(form).length) {
          callback();
        }
      }
    }
  );


})

router.get('/order/save/confirmation/:id', isLoggedIn, multipartMiddleware, function(req, res, next) {

  var id = req.params.id;
  // var filename  = './'+ id +'.pdf';
  // console.log(id);
  var db = req.db;
  var ordersDB = db.get('orders')
  ordersDB.findOne({
    "_id": id
  }, {}, function(err, doc) {
    // console.log(doc.note_attributes)
    res.render('order-save', {
      "order": doc
    })
  })

})


router.post('/order/pdf/save/:id', multipartMiddleware, function(req, res, next) {

  var id = req.params.id;
  var filename = './' + id + '.pdf';
  // console.log(id);
  var db = req.db;
  var file = req.body
  // console.log(file)
  // var pdf = new jsPDF('p', 'mm', 'a4');
  // pdf.addImage(file.image, 'PNG', 0, 0, 211, 298);
  // console.log(pdf)
  // var data = pdf.output();
  //
  // fs.writeFileSync(filename, data);
})


router.get('/order/delete/:id', multipartMiddleware, function(req, res, next) {

  var id = req.params.id;
  // console.log(id);
  var db = req.db;
  var ordersDB = db.get('orders')
  ordersDB.remove({
    '_id': id
  })
  res.redirect('/orders')
})






router.post('/new/order', function(req, res, next) {
  var db = req.db;
  var ordersDB = db.get('orders')
  var order_number = req.body.name;
  ordersDB.findOne({
    "name": order_number
  }, {}, function(err, doc) {
    console.log('*/-----------NEW ORDER------------/*')
    console.log('order_number:', order_number, 'existing:', !!doc)
    if (doc) {

      /////////////////////////////////

      if (doc.source_name === 'subscription_contract') {
        console.log('SUBSCRIPTION CODE 1')
        var original_order = doc;
        var url = shopifyApiUrl('/customers/' + doc.customer.id + '/orders.json?status=any');
        var auth = shopifyAuthHeader();

        request.get({
            url: url,
            headers: {
              "Authorization": auth
            },
          },
          function(error, response, body) {
            // console.log(response.headers.date)
            // console.log(body)
            if (error) {
              console.log(error)
              res.send('index', {
                "message": "THERE WAS AN ISSUE PRINTING, LET TREY KNOW IMMEDIATELY"
              })
            } else {
              var orders = JSON.parse(body).orders;
              // var subscription_number = orders.length + 1;
              // var subscription_tag = "Subscription " + subscription_number;
              var subscription_tag2 = "Subscription";
              // console.log("Orders: " + subscription_number)
              var found = false;
              orders.slice(1).forEach(order => {
                if (order.shipping_lines.length > 0 && found === false) {
                if (order.shipping_lines[0].title === 'Subscription shipping' || order.shipping_lines[0].title === 'Subscription · Shipping') {
                  found = true;
                  var today = moment().format('YYYY/MM/DD')
                  var current_day_of_week = moment().weekday();
                  // console.log(current_day_of_week)
                  var today_tag;
                  var today_tag_plusthree;
                  if (current_day_of_week === 7) {
                    today_tag = moment().add(1,'days').format('MM/DD/YYYY')
                    today_tag_plusthree = moment().add(1,'days').format('MM/DD/YYYY')
                  } else {
                    today_tag = moment().format('MM/DD/YYYY')
                    today_tag_plusthree = moment().format('MM/DD/YYYY')
                  }
                  var order_tags = order.tags.split(',').slice(1);
                  console.log('OLD TAGS: ' + order_tags)
                  // console.log(order.note_attributes)
                  // console.log(order.tags)
                  // console.log(original_order.id)

                  var dateIndex = order.note_attributes.findIndex(x => x.name === 'Delivery-Date');
                  var dateIndex2 = order.note_attributes.findIndex(x => x.name === 'Pickup-Date');
                  // console.log(dateIndex)
                  if (dateIndex > -1) {
                    order.note_attributes[dateIndex] = {
                      "name": 'Delivery-Date',
                      "value": today
                    }
                    order_tags.push(today_tag_plusthree)
                  }
                  if (dateIndex2 > -1) {
                    order.note_attributes[dateIndex2] = {
                      "name": 'Pickup-Date',
                      "value": today
                    }
                    order_tags.push(today_tag)
                  }


                  order_tags.push(subscription_tag2)
                  // order_tags.join()
                  var new_tags = order_tags.join()
                  // console.log(new_tags)
                  console.log('NEW TAGS: ' + new_tags)
                  console.log('TODAY: ' + today)

                  var formData2 = {
                    "order": {
                      "id": original_order.id,
                      "note": order.note,
                      "tags": new_tags,
                      "note_attributes": order.note_attributes
                    }
                  }
                  var url2 = shopifyApiUrl('/orders/' + original_order.id + '.json');
                  var auth2 = shopifyAuthHeader();

                  request.put({
                      url: url2,
                      headers: {
                        "Authorization": auth2
                      },
                      json: true,
                      body: formData2
                    },
                    function(error, response, body) {
                      // console.log(response.headers.date)
                      // console.log(body)
                      if (error) {
                        console.log(error)
                        printOrder.webhookAck(res);
                      } else {
                        printOrder.finishWebhookWithPrint(doc, db, res, nl2br);
                      }
                    }
                  );
                }
              } else {

              }
              });
              if (!found) {
                printOrder.webhookAck(res);
              }
            }
          }
        );

      } else {
        printOrder.finishWebhookWithPrint(doc, db, res, nl2br);
      }

      ///////////////////////////////////////////////


    } else {

      var db = req.db;
      var ordersDB = db.get('orders')
      // ordersDB.insert(req.body
      // console.log(req.body)
      var items = req.body.line_items;

      // ordersDB.findOne({
      //   "id": req.body.id
      ordersDB.insert(req.body, function(err, doc) {
        console.log(err)
        if (err || !doc) {
          return res.status(500).send('insert failed');
        }
        if (doc.source_name === 'subscription_contract') {
          console.log('SUBSCRIPTION CODE 2')
          var original_order = doc;
          var url = shopifyApiUrl('/customers/' + doc.customer.id + '/orders.json?status=any');
          var auth = shopifyAuthHeader();

          request.get({
              url: url,
              headers: {
                "Authorization": auth
              },
            },
            function(error, response, body) {
              // console.log(response.headers.date)
              // console.log(body)
              if (error) {
                console.log(error)
                res.send('index', {
                  "message": "THERE WAS AN ISSUE PRINTING, LET TREY KNOW IMMEDIATELY"
                })
              } else {
                var orders = JSON.parse(body).orders;
                // var subscription_number = orders.length + 1;
                // var subscription_tag = "Subscription " + subscription_number;
                var subscription_tag2 = "Subscription";
                // console.log("Orders: " + subscription_number)
                var found = false;
                orders.slice(1).forEach(order => {
                  if (order.shipping_lines.length > 0 && found === false) {
                  if (order.shipping_lines[0].title === 'Subscription shipping' || order.shipping_lines[0].title === 'Subscription · Shipping') {
                    found = true;
                    var today = moment().format('YYYY/MM/DD')
                    var current_day_of_week = moment().weekday();
                    // console.log(current_day_of_week)
                    var today_tag;
                    var today_tag_plusthree;
                    if (current_day_of_week === 7) {
                      today_tag = moment().add(1,'days').format('MM/DD/YYYY')
                      today_tag_plusthree = moment().add(1,'days').format('MM/DD/YYYY')
                    } else {
                      today_tag = moment().format('MM/DD/YYYY')
                      today_tag_plusthree = moment().format('MM/DD/YYYY')
                    }
                    var order_tags = order.tags.split(',').slice(1);

                    console.log('OLD TAGS: ' + order_tags)
                    // console.log(order.note_attributes)
                    // console.log(order.tags)
                    // console.log(original_order.id)

                    var dateIndex = order.note_attributes.findIndex(x => x.name === 'Delivery-Date');
                    var dateIndex2 = order.note_attributes.findIndex(x => x.name === 'Pickup-Date');
                    // console.log(dateIndex)
                    if (dateIndex > -1) {
                      order.note_attributes[dateIndex] = {
                        "name": 'Delivery-Date',
                        "value": today
                      }
                      order_tags.push(today_tag_plusthree)
                    }
                    if (dateIndex2 > -1) {
                      order.note_attributes[dateIndex2] = {
                        "name": 'Pickup-Date',
                        "value": today
                      }
                      order_tags.push(today_tag)
                    }


                    order_tags.push(subscription_tag2)
                    // order_tags.join()
                    var new_tags = order_tags.join()
                    // console.log(new_tags)
                    console.log('NEW TAGS: ' + new_tags)
                    console.log('TODAY: ' + today)

                    var formData2 = {
                      "order": {
                        "id": original_order.id,
                        "note": order.note,
                        "tags": new_tags,
                        "note_attributes": order.note_attributes
                      }
                    }
                    var url2 = shopifyApiUrl('/orders/' + original_order.id + '.json');
                    var auth2 = shopifyAuthHeader();

                    request.put({
                        url: url2,
                        headers: {
                          "Authorization": auth2
                        },
                        json: true,
                        body: formData2
                      },
                      function(error, response, body) {
                        // console.log(response.headers.date)
                        // console.log(body)
                        if (error) {
                          console.log(error)
                          printOrder.webhookAck(res);
                        } else {
                          printOrder.finishWebhookWithPrint(doc, db, res, nl2br);
                        }
                      }
                    );
                  }
                } else {
                }
                });
                if (!found) {
                  printOrder.webhookAck(res);
                }
              }
            }
          );

        } else {
          printOrder.finishWebhookWithPrint(doc, db, res, nl2br);
        }
      })
    }
  })



});


router.post('/new3/order', function(req, res) {
  console.log('POST /new3/order deprecated — use POST /new/order');
  res.status(410).send('deprecated — use POST /new/order');
});



function isLoggedIn(req, res, next) {

  // if user is authenticated in the session, carry on
  if (req.isAuthenticated())
    return next();

  // if they aren't redirect them to the home page
  res.redirect('/login');
}

function isSuperAdmin(req, res, next) {
  var email = req.user.local.email
  if (email === "jacksrf@gmail.com") {
    return next();
  } else {
    res.redirect('/admin/home', {
      "message": "****You dont have access to that page... sorry!"
    });
  }
}

module.exports = router;

var express = require('express');
var router = express.Router();
var rest = require('restler');
var fs = require('fs');
var pdf = require('html-pdf');
var request = require('request');
// var jsPDF = require('jspdf');
var cheerio = require('cheerio')
var htmlToImage = require('html-to-image');
var webshot = require('webshot');
var moment = require('moment');
var nl2br = require('nl2br');

var multipart = require('connect-multiparty');
var multipartMiddleware = multipart();

var passport = require('passport');
var express = require('express');
var router = express.Router();
var mongo = require('mongodb')
var fetch = require("node-fetch");

router.use(function(req, res, next) {
  next();
});
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
  var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  //console.log(ip)
  //console.log(req)
  var db = req.db;
  var ordersDB = db.get('orders')
  ordersDB.find({}, {
    limit: 500,
    sort: {
      'processed_at': -1
    }
  }, function(err, orders) {
    console.log(err)
//    console.log(orders)
    var todaysOrdersClean = Array.from(new Set(orders.map(a => a.id)))
      .map(id => {
        return orders.find(a => a.id === id)
      })
    res.render('orders', {
      orders: todaysOrdersClean,
      moment: moment
    })
  })
});

router.get('/orders/today', isLoggedIn, function(req, res, next) {
  var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  //console.log(ip)
  //console.log(req)
  var db = req.db;
  var today = moment().format('YYYY/MM/DD').toString()
  // var today = '2020/12/23'
  console.log(today)
  var ordersDB = db.get('orders')
  var todaysOrders = [];
  ordersDB.find({}, {
    limit: 1000,
    sort: {
      _id: -1
    }
  }, function(err, orders) {
    console.log(err)
    // console.log(orders)
    for (j = 0; j < orders.length; j++) {
      orders[j].deliver_day = "";
      orders[j].orderNotes = {};
      if (orders[j].note_attributes && orders[j].customer != undefined) {
        console.log(orders[j].customer)
        console.log(orders[j].name)
        for (i = 0; i < orders[j].note_attributes.length; i++) {
          var key = orders[j].note_attributes[i].name.replace(/ /g, "_").replace(/-/g, "_").toLowerCase();
          var value = orders[j].note_attributes[i].value.toString();
          orders[j].orderNotes[key] = value;
          if (i === orders[j].note_attributes.length - 1) {
            // console.log(orders[j].orderNotes)
            // console.log(orders[j].orderNotes.delivery_date)
            // console.log(today)
            if (orders[j].orderNotes.checkout_method === 'delivery') {
              if (orders[j].orderNotes.delivery_date) {
                var delivery_date_clean = orders[j].orderNotes.delivery_date.replace(/-/g, "/")
                if (delivery_date_clean === today) {
                  // console.log(orders[j].name)
                  todaysOrders.push(orders[j])
                }
              }
            }

            if (orders[j].orderNotes.checkout_method === 'pickup') {
              if (orders[j].orderNotes.pickup_date) {
                var pickup_date_clean = orders[j].orderNotes.pickup_date.replace(/-/g, "/")
                if (pickup_date_clean === today) {
                  // console.log(orders[j].name)
                  todaysOrders.push(orders[j])
                }
              }
            }
          }
        }
      }
      if (j === orders.length - 1) {
        // var todaysOrdersSet = new Set(todaysOrders);
        var todaysOrdersClean = Array.from(new Set(todaysOrders.map(a => a.id)))
          .map(id => {
            return todaysOrders.find(a => a.id === id)
          })
        res.render('orders-today', {
          orders: todaysOrdersClean
        })
      }
    }

  })
});

router.get('/orders/tomorrow', isLoggedIn, function(req, res, next) {
  var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  console.log(ip)
  console.log(req)
  var db = req.db;
  var today = moment().add(1, 'days').format('YYYY/MM/DD').toString()
  // var today = '2020/12/23'
  console.log(today)
  var ordersDB = db.get('orders')
  var todaysOrders = [];
  ordersDB.find({}, {
    limit: 2000,
    sort: {
      _id: -1
    }
  }, function(err, orders) {
    console.log(err)
    // console.log(orders)
    for (j = 0; j < orders.length; j++) {
      orders[j].deliver_day = "";
      orders[j].orderNotes = {};
      if (orders[j].note_attributes && orders[j].customer) {
        console.log(orders[j].customer)
        for (i = 0; i < orders[j].note_attributes.length; i++) {
          var key = orders[j].note_attributes[i].name.replace(/ /g, "_").replace(/-/g, "_").toLowerCase();
          var value = orders[j].note_attributes[i].value.toString();
          orders[j].orderNotes[key] = value;
          if (i === orders[j].note_attributes.length - 1) {
            // console.log(orders[j].orderNotes)
            console.log(orders[j].orderNotes.delivery_date)
            console.log(today)
            if (orders[j].orderNotes.checkout_method === 'delivery') {
              if (orders[j].orderNotes.delivery_date) {
                var delivery_date_clean = orders[j].orderNotes.delivery_date.replace(/-/g, "/")
                if (delivery_date_clean === today) {
                  console.log(orders[j].name)
                  todaysOrders.push(orders[j])
                }
              }
            }

            if (orders[j].orderNotes.checkout_method === 'pickup') {
              if (orders[j].orderNotes.pickup_date) {
                var pickup_date_clean = orders[j].orderNotes.pickup_date.replace(/-/g, "/")
                if (pickup_date_clean === today) {
                  console.log(orders[j].name)
                  todaysOrders.push(orders[j])
                }
              }
            }
          }
        }
      }
      if (j === orders.length - 1) {
        // var todaysOrdersSet = new Set(todaysOrders);
        var todaysOrdersClean = Array.from(new Set(todaysOrders.map(a => a.id)))
          .map(id => {
            return todaysOrders.find(a => a.id === id)
          })
        res.render('orders-tomorrow', {
          orders: todaysOrdersClean
        })
      }
    }

  })
});

router.post('/orders/search', isLoggedIn, function(req, res, next) {
  var order = req.body.order;
  console.log(order)
  var order_number = '#' + order;
  var db = req.db;
  var ordersDB = db.get('orders')
  if (order === "") {
    ordersDB.find({}, {
      limit: 500,
      sort: {
        'processed_at': -1
      }
    }, function(err, orders) {
      console.log(err)
      // console.log(orders)
      var ordersClean = Array.from(new Set(orders.map(a => a.id)))
        .map(id => {
          return orders.find(a => a.id === id)
        })
      res.render('orders', {
        orders: ordersClean,
        moment: moment
      })
    })
  } else {
    ordersDB.find({
      $or: [{
        "name": order_number
      }, {
        "customer.first_name": new RegExp('^' + order + '$', "i")
      }]
    }, {
      limit: 500,
      sort: {
        'processed_at': -1
      }
    }, function(err, orders) {
      console.log(err)
      // console.log(orders)
      var ordersClean = Array.from(new Set(orders.map(a => a.id)))
        .map(id => {
          return orders.find(a => a.id === id)
        })
      res.render('orders', {
        orders: ordersClean,
        moment: moment
      })
    })
  }

})

// '01/05/2021, Local Delivery, Local Delivery Order'
// '01/04/2021, 16:00, Pickup Order'

router.get('/subscriptions', function(req, res, next) {
  // "source_name": "subscription_contract",
  var db = req.db;
  var ordersDB = db.get('orders')
  ordersDB.find({
    "source_name": 'subscription_contract'
  }, {}, function(err, docs) {
    console.log(docs.length)
    var ordersClean = Array.from(new Set(docs.map(a => a.id)))
      .map(id => {
        return docs.find(a => a.id === id)
      })
    for (i = 0; i < ordersClean.length; i++) {
      console.log(ordersClean[i].name)
    }
    res.send()
  })
})

router.post('/new2/order', function(req, res, next) {
  var db = req.db;
  var ordersDB = db.get('orders')
  var order_number = req.body.name;
  ordersDB.findOne({
    "name": order_number
  }, {}, function(err, doc) {
    console.log('*/-----------NEW ORDER------------/*')
    console.log(err)
    console.log(doc)
    if (doc) {
      var db = req.db;
      var ordersDB = db.get('orders')
      // ordersDB.insert(req.body)
      // console.log(req.body)
      var items = req.body.line_items;

      // ordersDB.findOne({
      //   "id": req.body.id
      ordersDB.insert(req.body, function(err, doc) {
        doc.note = nl2br(doc.note);
        // console.log(doc.note);
        doc.deliver_day = "";
        if (doc.user_id) {

        } else {
          doc.user_id = "";
        }
        doc.orderNotes = {};

        for (i = 0; i < doc.note_attributes.length; i++) {
          var key = doc.note_attributes[i].name.replace(/ /g, "_").replace(/-/g, "_").toLowerCase();
          var value = doc.note_attributes[i].value.toString();
          doc.orderNotes[key] = value;
          if (i === doc.note_attributes.length - 1) {
            // console.log(doc.orderNotes)
          }
        }
        if (doc.orderNotes.checkout_method === "delivery" || doc.orderNotes.checkout_method === 'pickup') {
          // console.log(doc)
          if (doc.orderNotes.checkout_method === "delivery") {

          }

          if (doc.orderNotes.checkout_method === "pickup") {

          }
          var printerDB = db.get('printer')
          printerDB.findOne({}, {}, function(err, printer) {
            // console.log(printer.printer_id)
            if (doc.note_attributes[1] != undefined) {

              var options = {
          screenSize: {
            'width': 1350,
            'height': 2200
          },
          phantomPath: require('phantomjs2').path,
          phantomConfig: { 'ignore-ssl-errors': 'true'}
        }
        var options2 = {
          'width': 1350,
          'height': 2200
        }
              // console.log(doc._id)
              webshot("https://admin.alsflowersmontgomery.com/order/pdf/" + doc._id, "./public/pdf/" + doc._id + ".pdf", options, function(err) {
                console.log(err)
                // setTimeout(function() {
                // 545151
                var formData = {
                  "printer": 69637774,
                  "title": "Order: " + doc.order_number,
                  "contentType": "pdf_uri",
                  "content": "https://api.alsflowersmontgomery.com/pdf/" + doc._id + ".pdf",
                  "source": "api documentation!",
                  "options": {
                    "paper": "Legal",
                  }
                }
                var username = "7qPBLc9mtxCwF1vc53b4c774OhS5CbRMZfoxN3jy78A";
                var password = "";
                var url = "https://api.printnode.com/printjobs";
                var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

                request.post({
                    url: url,
                    headers: {
                      "Authorization": auth
                    },
                    json: true,
                    body: formData
                  },
                  function(error, response, body) {
                    if (error) {
                      console.log(error)
                      // setTimeout(function() {
                      res.end();
                      // }, 1000)
                    } else {
                      // console.log(response)
                      console.log(moment().format('MMMM Do YYYY, h:mm a'));
                      console.log('NEW ORDER#:' + doc.order_number)
                      // setTimeout(function() {
                      res.end();
                      // }, 1000)
                    }
                  }
                );

                // }, 4000)
              });

            } else {
              res.end();
            }
          })
        } else {
          res.send()
        }
      })
    } else {
      doc.note = nl2br(doc.note);
      // console.log(doc.note);
      doc.deliver_day = "";
      if (doc.user_id) {

      } else {
        doc.user_id = "";
      }
      doc.orderNotes = {};

      for (i = 0; i < doc.note_attributes.length; i++) {
        var key = doc.note_attributes[i].name.replace(/ /g, "_").replace(/-/g, "_").toLowerCase();
        var value = doc.note_attributes[i].value.toString();
        doc.orderNotes[key] = value;
        if (i === doc.note_attributes.length - 1) {
          // console.log(doc.orderNotes)

        }
      }
      if (doc.orderNotes.checkout_method === "delivery" || doc.orderNotes.checkout_method === 'pickup') {
        // console.log(doc.number)
        var printerDB = db.get('printer')
        printerDB.findOne({}, {}, function(err, printer) {
          // console.log(printer.printer_id)
          if (doc.note_attributes[1] != undefined) {
            var options = {
          screenSize: {
            'width': 1350,
            'height': 2200
          },
          phantomPath: require('phantomjs2').path,
          phantomConfig: { 'ignore-ssl-errors': 'true'}
        }
        var options2 = {
          'width': 1350,
          'height': 2200
        }
            // console.log(doc._id)
            webshot("https://admin.alsflowersmontgomery.com/order/pdf/" + doc._id, "./public/pdf/" + doc._id + ".pdf", options, function(err) {
              console.log(err)
              // setTimeout(function() {
              // 545151
              var formData = {
                "printer": 69637774,
                "title": "Order: " + doc.order_number,
                "contentType": "pdf_uri",
                "content": "https://api.alsflowersmontgomery.com/pdf/" + doc._id + ".pdf",
                "source": "api documentation!",
                "options": {
                  "paper": "Legal",
                }
              }
              var username = "7qPBLc9mtxCwF1vc53b4c774OhS5CbRMZfoxN3jy78A";
              var password = "";
              var url = "https://api.printnode.com/printjobs";
              var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

              request.post({
                  url: url,
                  headers: {
                    "Authorization": auth
                  },
                  json: true,
                  body: formData
                },
                function(error, response, body) {
                  if (error) {
                    console.log(error)
                    // setTimeout(function() {
                    res.end();
                    // }, 1000)
                  } else {
                    // console.log(response)
                    console.log(moment().format('MMMM Do YYYY, h:mm a'));
                    console.log('NEW ORDER#:' + doc.order_number)
                    // setTimeout(function() {
                    res.end();
                    // }, 1000)
                  }
                }
              );

              // }, 4000)
            });
          } else {
            res.end();
          }
        })
      } else {
        res.send();
      }
      // res.send();
    }
  })


  // }

});


router.get('/order/reprint/pdf/:id', isLoggedIn, function(req, res, next) {
  // var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  // console.log(ip)
  var key = req.query.key;
  // console.log(key)
  var id = req.params.id;
  var db = req.db;
  var ordersDB = db.get('orders')
  // if (key != undefined) {
  ordersDB.findOne({
    "_id": id
  }, {}, function(err, doc) {
    if (err) {
      console.log(err)
    }
    console.log(doc)
    var printerDB = db.get('printer')
    printerDB.findOne({}, {}, function(err, printer) {
      console.log(doc.updated_at)
      var isafter = moment(doc.updated_at).isAfter('2018-06-01T00:00:00+00:00');
      console.log(isafter)
      // console.log(doc.note_attributes)
      // if (isafter === "true" || isafter === true) {
      console.log(doc.note_attributes)
      if (doc.note_attributes[1] != undefined) {
        var options = {
          screenSize: {
            'width': 1350,
            'height': 2200
          },
          phantomPath: require('phantomjs2').path,
          phantomConfig: { 'ignore-ssl-errors': 'true'}
        }
        var options2 = {
          'width': 1350,
          'height': 2200
        }
        console.log(doc._id)
        webshot("admin.alsflowersmontgomery.com/order/pdf/" + doc._id, "./public/pdf/" + doc._id + ".pdf", options, function(err) {
          console.log(err)
          setTimeout(function() {
            // console.log(printer.printer_id)
            var formData = {
              // "printer": printer.printer_id,
              "printer": 69637774,
              "title": "Order: " + doc.order_number,
              "contentType": "pdf_uri",
              "content": "https://api.alsflowersmontgomery.com/pdf/" + doc._id + ".pdf?t=" + Math.random(),
              "source": "api documentation!",
              "options": {
                "paper": "Legal",
              }
            }
            var username = "7qPBLc9mtxCwF1vc53b4c774OhS5CbRMZfoxN3jy78A";
            var password = "";
            var url = "https://api.printnode.com/printjobs";
            var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

            request.post({
                url: url,
                headers: {
                  "Authorization": auth
                },
                json: true,
                body: formData
              },
              function(error, response, body) {
                console.log(response.headers.date)
                console.log(body)
                if (error) {
                  console.log(error)
                  res.send('index', {
                    "message": "THERE WAS AN ISSUE PRINTING, LET TREY KNOW IMMEDIATELY"
                  })
                } else {
                  // console.log(response)
                  console.log('REPRINT')
                  console.log(moment().format('MMMM Do YYYY, h:mm a'));
                  console.log('REPRINTED ------ ORDER#:' + doc.order_number)
                  res.render('index', {
                    "message": "COMPLETED! YOURE PRINT SHOULD BECOMING SOON."
                  })
                }
              }
            );

          }, 4000)
        });

      } else {
        res.send()
      }
      // } else {
      //   res.send()
      // }

    });

  })
  // }

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
  console.log(order_number)
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
  console.log(id);
  var db = req.db;
  var ordersDB = db.get('orders')
  ordersDB.findOne({
    "_id": id
  }, {}, function(err, doc) {
    console.log(doc.note)
    console.log(doc.note_attributes.length);
    // console.log(doc)
    res.render('order-edit', {
      "order": doc
    })
  })

})
//
router.post('/order/edit/:id', isLoggedIn, multipartMiddleware, function(req, res, next) {
  console.log(req.body)
  var id = req.params.id;
  // // var filename  = './'+ id +'.pdf';
  var form = req.body.note_attributes
  console.log(id);
  // console.log(form)
  var newNoteAttributes = [];
  var newNote = ''

  function callback() {
    console.log('all done');
    console.log(newNoteAttributes)
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
      console.log(key, value)
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
        console.log(item)
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
  console.log(id);
  var db = req.db;
  var ordersDB = db.get('orders')
  ordersDB.findOne({
    "_id": id
  }, {}, function(err, doc) {
    console.log(doc.note_attributes)
    res.render('order-save', {
      "order": doc
    })
  })

})


router.post('/order/pdf/save/:id', multipartMiddleware, function(req, res, next) {

  var id = req.params.id;
  var filename = './' + id + '.pdf';
  console.log(id);
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
  console.log(id);
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
    console.log(err)
    // console.log(doc)
    if (doc) {

      /////////////////////////////////

      if (doc.source_name === 'subscription_contract') {
        console.log('SUBSCRIPTION CODE 1')
        var original_order = doc;
        console.log(doc.customer.id)
        var username = "36274b5cf78a52bfa4c6780ba48a2fb1";
        var password = "a26e549d188fe3459e1ed5b1c2cb1425";
        var url = "https://als-flowers.myshopify.com/admin/api/2021-01/customers/" + doc.customer.id + "/orders.json?status=any";
        var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

        request.get({
            url: url,
            headers: {
              "Authorization": auth
            },
          },
          function(error, response, body) {
            // console.log(response.headers.date)
            console.log(body)
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
                  console.log(current_day_of_week)
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
                  console.log(order.note_attributes)
                  console.log(order.tags)
                  console.log(original_order.id)

                  var dateIndex = order.note_attributes.findIndex(x => x.name === 'Delivery-Date');
                  var dateIndex2 = order.note_attributes.findIndex(x => x.name === 'Pickup-Date');
                  console.log(dateIndex)
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
                  console.log(new_tags)
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
                  var username2 = "36274b5cf78a52bfa4c6780ba48a2fb1";
                  var password2 = "a26e549d188fe3459e1ed5b1c2cb1425";
                  var url2 = "https://als-flowers.myshopify.com/admin/api/2021-01/orders/" + original_order.id + ".json";
                  var auth2 = "Basic " + new Buffer(username2 + ":" + password2).toString("base64");

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
                      } else {
                        doc.note = nl2br(doc.note);
                        // console.log(doc.note);
                        doc.deliver_day = "";
                        if (doc.user_id) {

                        } else {
                          doc.user_id = "";
                        }
                        doc.orderNotes = {};

                        for (i = 0; i < doc.note_attributes.length; i++) {
                          var key = doc.note_attributes[i].name.replace(/ /g, "_").replace(/-/g, "_").toLowerCase();
                          var value = doc.note_attributes[i].value.toString();
                          doc.orderNotes[key] = value;
                          if (i === doc.note_attributes.length - 1) {
                            // console.log(doc.orderNotes)
                          }
                        }
                        if (doc.orderNotes.checkout_method === "delivery" || doc.orderNotes.checkout_method === 'pickup') {
                          // console.log(doc)
                          if (doc.orderNotes.checkout_method === "delivery") {

                          }

                          if (doc.orderNotes.checkout_method === "pickup") {

                          }
                          // var printerDB = db.get('printer')
                          // printerDB.findOne({}, {}, function(err, printer) {
                          // console.log(printer.printer_id)
                          if (doc.note_attributes[1] != undefined) {
                            var options = {
          screenSize: {
            'width': 1350,
            'height': 2200
          },
          phantomPath: require('phantomjs2').path,
          phantomConfig: { 'ignore-ssl-errors': 'true'}
        }
        var options2 = {
          'width': 1350,
          'height': 2200
        }
                            // console.log(doc._id)
                            webshot("https://admin.alsflowersmontgomery.com/order/pdf/" + doc._id, "./public/pdf/" + doc._id + ".pdf", options, function(err) {
                              console.log(err)
                              // setTimeout(function() {
                              // 545151
                              var formData = {
                                "printer": 69637774,
                                "title": "Order: " + doc.order_number,
                                "contentType": "pdf_uri",
                                "content": "https://api.alsflowersmontgomery.com/pdf/" + doc._id + ".pdf",
                                "source": "api documentation!",
                                "options": {
                                  "paper": "Legal",
                                }
                              }
                              var username = "7qPBLc9mtxCwF1vc53b4c774OhS5CbRMZfoxN3jy78A";
                              var password = "";
                              var url = "https://api.printnode.com/printjobs";
                              var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

                              request.post({
                                  url: url,
                                  headers: {
                                    "Authorization": auth
                                  },
                                  json: true,
                                  body: formData
                                },
                                function(error, response, body) {
                                  if (error) {
                                    console.log(error)
                                    // setTimeout(function() {
                                    res.end();
                                    // }, 1000)
                                  } else {
                                    // console.log(response)
                                    console.log(moment().format('MMMM Do YYYY, h:mm a'));
                                    console.log('NEW ORDER#:' + doc.order_number)
                                    // setTimeout(function() {
                                    res.end();
                                    // }, 1000)
                                  }
                                }
                              );

                              // }, 4000)
                            });

                          } else {
                            res.end();
                          }
                          // })
                        } else {
                          res.send()
                        }
                      }
                    }
                  );
                }
              } else {

              }
              });
            }
          }
        );

      } else {
        doc.note = nl2br(doc.note);
        // console.log(doc.note);
        doc.deliver_day = "";
        if (doc.user_id) {

        } else {
          doc.user_id = "";
        }
        doc.orderNotes = {};

        for (i = 0; i < doc.note_attributes.length; i++) {
          var key = doc.note_attributes[i].name.replace(/ /g, "_").replace(/-/g, "_").toLowerCase();
          var value = doc.note_attributes[i].value.toString();
          doc.orderNotes[key] = value;
          if (i === doc.note_attributes.length - 1) {
            // console.log(doc.orderNotes)
          }
        }
        if (doc.orderNotes.checkout_method === "delivery" || doc.orderNotes.checkout_method === 'pickup') {
          // console.log(doc)
          if (doc.orderNotes.checkout_method === "delivery") {

          }

          if (doc.orderNotes.checkout_method === "pickup") {

          }
          // var printerDB = db.get('printer')
          // printerDB.findOne({}, {}, function(err, printer) {
          // console.log(printer.printer_id)
          if (doc.note_attributes[1] != undefined) {
            var options = {
          screenSize: {
            'width': 1350,
            'height': 2200
          },
          phantomPath: require('phantomjs2').path,
          phantomConfig: { 'ignore-ssl-errors': 'true'}
        }
        var options2 = {
          'width': 1350,
          'height': 2200
        }
            // console.log(doc._id)
            webshot("https://admin.alsflowersmontgomery.com/order/pdf/" + doc._id, "./public/pdf/" + doc._id + ".pdf", options, function(err) {
              console.log(err)
              // setTimeout(function() {
              // 545151
              var formData = {
                "printer": 69637774,
                "title": "Order: " + doc.order_number,
                "contentType": "pdf_uri",
                "content": "https://api.alsflowersmontgomery.com/pdf/" + doc._id + ".pdf",
                "source": "api documentation!",
                "options": {
                  "paper": "Legal",
                }
              }
              var username = "7qPBLc9mtxCwF1vc53b4c774OhS5CbRMZfoxN3jy78A";
              var password = "";
              var url = "https://api.printnode.com/printjobs";
              var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

              request.post({
                  url: url,
                  headers: {
                    "Authorization": auth
                  },
                  json: true,
                  body: formData
                },
                function(error, response, body) {
                  if (error) {
                    console.log(error)
                    // setTimeout(function() {
                    res.end();
                    // }, 1000)
                  } else {
                    // console.log(response)
                    console.log(moment().format('MMMM Do YYYY, h:mm a'));
                    console.log('NEW ORDER#:' + doc.order_number)
                    // setTimeout(function() {
                    res.end();
                    // }, 1000)
                  }
                }
              );

              // }, 4000)
            });

          } else {
            res.end();
          }
          // })
        } else {
          res.send()
        }
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
        if (doc.source_name === 'subscription_contract') {
          console.log('SUBSCRIPTION CODE 2')
          var original_order = doc;
          console.log(doc.customer.id)
          var username = "36274b5cf78a52bfa4c6780ba48a2fb1";
          var password = "a26e549d188fe3459e1ed5b1c2cb1425";
          var url = "https://als-flowers.myshopify.com/admin/api/2021-01/customers/" + doc.customer.id + "/orders.json?status=any";
          var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

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
                    console.log(current_day_of_week)
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
                    console.log(order.note_attributes)
                    console.log(order.tags)
                    console.log(original_order.id)

                    var dateIndex = order.note_attributes.findIndex(x => x.name === 'Delivery-Date');
                    var dateIndex2 = order.note_attributes.findIndex(x => x.name === 'Pickup-Date');
                    console.log(dateIndex)
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
                    console.log(new_tags)
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
                    var username2 = "36274b5cf78a52bfa4c6780ba48a2fb1";
                    var password2 = "a26e549d188fe3459e1ed5b1c2cb1425";
                    var url2 = "https://als-flowers.myshopify.com/admin/api/2021-01/orders/" + original_order.id + ".json";
                    var auth2 = "Basic " + new Buffer(username2 + ":" + password2).toString("base64");

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
                        } else {
                          doc.note = nl2br(doc.note);
                          // console.log(doc.note);
                          doc.deliver_day = "";
                          if (doc.user_id) {

                          } else {
                            doc.user_id = "";
                          }
                          doc.orderNotes = {};

                          for (i = 0; i < doc.note_attributes.length; i++) {
                            var key = doc.note_attributes[i].name.replace(/ /g, "_").replace(/-/g, "_").toLowerCase();
                            var value = doc.note_attributes[i].value.toString();
                            doc.orderNotes[key] = value;
                            if (i === doc.note_attributes.length - 1) {
                              // console.log(doc.orderNotes)
                            }
                          }
                          if (doc.orderNotes.checkout_method === "delivery" || doc.orderNotes.checkout_method === 'pickup') {
                            // console.log(doc)
                            if (doc.orderNotes.checkout_method === "delivery") {

                            }

                            if (doc.orderNotes.checkout_method === "pickup") {

                            }
                            // var printerDB = db.get('printer')
                            // printerDB.findOne({}, {}, function(err, printer) {
                            // console.log(printer.printer_id)
                            if (doc.note_attributes[1] != undefined) {
                              var options = {
          screenSize: {
            'width': 1350,
            'height': 2200
          },
          phantomPath: require('phantomjs2').path,
          phantomConfig: { 'ignore-ssl-errors': 'true'}
        }
        var options2 = {
          'width': 1350,
          'height': 2200
        }
                              // console.log(doc._id)
                              webshot("https://admin.alsflowersmontgomery.com/order/pdf/" + doc._id, "./public/pdf/" + doc._id + ".pdf", options, function(err) {
                                console.log(err)
                                // setTimeout(function() {
                                // 545151
                                var formData = {
                                  "printer": 69637774,
                                  "title": "Order: " + doc.order_number,
                                  "contentType": "pdf_uri",
                                  "content": "https://api.alsflowersmontgomery.com/pdf/" + doc._id + ".pdf",
                                  "source": "api documentation!",
                                  "options": {
                                    "paper": "Legal",
                                  }
                                }
                                var username = "7qPBLc9mtxCwF1vc53b4c774OhS5CbRMZfoxN3jy78A";
                                var password = "";
                                var url = "https://api.printnode.com/printjobs";
                                var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

                                request.post({
                                    url: url,
                                    headers: {
                                      "Authorization": auth
                                    },
                                    json: true,
                                    body: formData
                                  },
                                  function(error, response, body) {
                                    if (error) {
                                      console.log(error)
                                      // setTimeout(function() {
                                      res.end();
                                      // }, 1000)
                                    } else {
                                      // console.log(response)
                                      console.log(moment().format('MMMM Do YYYY, h:mm a'));
                                      console.log('NEW ORDER#:' + doc.order_number)
                                      // setTimeout(function() {
                                      res.end();
                                      // }, 1000)
                                    }
                                  }
                                );

                                // }, 4000)
                              });

                            } else {
                              res.end();
                            }
                            // })
                          } else {
                            res.send()
                          }
                        }
                      }
                    );
                  }
                } else {
                }
                });
              }
            }
          );

        } else {
          doc.note = nl2br(doc.note);
          // console.log(doc.note);
          doc.deliver_day = "";
          if (doc.user_id) {

          } else {
            doc.user_id = "";
          }
          doc.orderNotes = {};

          for (i = 0; i < doc.note_attributes.length; i++) {
            var key = doc.note_attributes[i].name.replace(/ /g, "_").replace(/-/g, "_").toLowerCase();
            var value = doc.note_attributes[i].value.toString();
            doc.orderNotes[key] = value;
            if (i === doc.note_attributes.length - 1) {
              // console.log(doc.orderNotes)
            }
          }
          if (doc.orderNotes.checkout_method === "delivery" || doc.orderNotes.checkout_method === 'pickup') {
            // console.log(doc)
            if (doc.orderNotes.checkout_method === "delivery") {

            }

            if (doc.orderNotes.checkout_method === "pickup") {

            }
            // var printerDB = db.get('printer')
            // printerDB.findOne({}, {}, function(err, printer) {
            // console.log(printer.printer_id)
            if (doc.note_attributes[1] != undefined) {
              var options = {
          screenSize: {
            'width': 1350,
            'height': 2200
          },
          phantomPath: require('phantomjs2').path,
          phantomConfig: { 'ignore-ssl-errors': 'true'}
        }
        var options2 = {
          'width': 1350,
          'height': 2200
        }
              // console.log(doc._id)
              webshot("https://admin.alsflowersmontgomery.com/order/pdf/" + doc._id, "./public/pdf/" + doc._id + ".pdf", options, function(err) {
                console.log(err)
                // setTimeout(function() {
                // 545151
                var formData = {
                  "printer": 69637774,
                  "title": "Order: " + doc.order_number,
                  "contentType": "pdf_uri",
                  "content": "https://api.alsflowersmontgomery.com/pdf/" + doc._id + ".pdf",
                  "source": "api documentation!",
                  "options": {
                    "paper": "Legal",
                  }
                }
                var username = "7qPBLc9mtxCwF1vc53b4c774OhS5CbRMZfoxN3jy78A";
                var password = "";
                var url = "https://api.printnode.com/printjobs";
                var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

                request.post({
                    url: url,
                    headers: {
                      "Authorization": auth
                    },
                    json: true,
                    body: formData
                  },
                  function(error, response, body) {
                    if (error) {
                      console.log(error)
                      // setTimeout(function() {
                      res.end();
                      // }, 1000)
                    } else {
                      // console.log(response)
                      console.log(moment().format('MMMM Do YYYY, h:mm a'));
                      console.log('NEW ORDER#:' + doc.order_number)
                      // setTimeout(function() {
                      res.end();
                      // }, 1000)
                    }
                  }
                );

                // }, 4000)
              });

            } else {
              res.end();
            }
            // })
          } else {
            res.send()
          }
        }
      })
    }
  })



});































router.post('/new3/order', function(req, res, next) {
  var db = req.db;
  var ordersDB = db.get('orders')
  var order_number = req.body.name;
  ordersDB.findOne({
    "name": order_number
  }, {}, function(err, doc) {
    console.log('*/-----------NEW ORDER------------/*')
    console.log(err)
    // console.log(doc)
    if (doc) {

      /////////////////////////////////

      if (doc.source_name === 'subscription_contract') {
        console.log('SUBSCRIPTION CODE 1')
        var original_order = doc;
        console.log(doc.customer.id)
        var username = "36274b5cf78a52bfa4c6780ba48a2fb1";
        var password = "a26e549d188fe3459e1ed5b1c2cb1425";
        var url = "https://als-flowers.myshopify.com/admin/api/2021-01/customers/" + doc.customer.id + "/orders.json?status=any";
        var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

        request.get({
            url: url,
            headers: {
              "Authorization": auth
            },
          },
          function(error, response, body) {
            // console.log(response.headers.date)
            console.log(body)
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
              orders.slice(1).forEach(order => {
                if (order.shipping_lines[0].title === 'Subscription shipping' || order.shipping_lines[0].title === 'Subscription · Shipping') {
                  var today = moment().format('YYYY/MM/DD')
                  var today_tag = moment().format('MM/DD/YYYY')
                  var order_tags = order.tags.split(',').slice(1);
                  // console.log('OLD TAGS: ' + order_tags)
                  // console.log(order.note_attributes)
                  // console.log(order.tags)
                  // console.log(original_order.id)
                  order_tags.push(today_tag)
                  order_tags.push(subscription_tag2)
                  // order_tags.join()
                  var new_tags = order_tags.join()
                  // console.log(new_tags)
                  // console.log('NEW TAGS: ' + new_tags)
                  console.log('TODAY: ' + today)
                  var dateIndex = order.note_attributes.findIndex(x => x.name === 'Delivery-Date');
                  var dateIndex2 = order.note_attributes.findIndex(x => x.name === 'Pickup-Date');
                  console.log("dateIndex 1: " + dateIndex)
                  console.log("dateIndex 2: " + dateIndex2)
                  if (dateIndex > -1) {
                    order.note_attributes[dateIndex] = {
                      "name": 'Delivery-Date',
                      "value": today
                    }
                  }
                  if (dateIndex2 > -1) {
                    order.note_attributes[dateIndex2] = {
                      "name": 'Pickup-Date',
                      "value": today
                    }
                  }

                  var formData2 = {
                    "order": {
                      "id": original_order.id,
                      "note": order.note,
                      "tags": new_tags,
                      "note_attributes": order.note_attributes
                    }
                  }
                  var username2 = "36274b5cf78a52bfa4c6780ba48a2fb1";
                  var password2 = "a26e549d188fe3459e1ed5b1c2cb1425";
                  var url2 = "https://als-flowers.myshopify.com/admin/api/2021-01/orders/" + original_order.id + ".json";
                  var auth2 = "Basic " + new Buffer(username2 + ":" + password2).toString("base64");

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
                      } else {
                        doc.note = nl2br(doc.note);
                        // console.log(doc.note);
                        doc.deliver_day = "";
                        if (doc.user_id) {

                        } else {
                          doc.user_id = "";
                        }
                        doc.orderNotes = {};

                        for (i = 0; i < doc.note_attributes.length; i++) {
                          var key = doc.note_attributes[i].name.replace(/ /g, "_").replace(/-/g, "_").toLowerCase();
                          var value = doc.note_attributes[i].value.toString();
                          doc.orderNotes[key] = value;
                          if (i === doc.note_attributes.length - 1) {
                            // console.log(doc.orderNotes)
                          }
                        }
                        if (doc.orderNotes.checkout_method === "delivery" || doc.orderNotes.checkout_method === 'pickup') {
                          // console.log(doc)
                          if (doc.orderNotes.checkout_method === "delivery") {

                          }

                          if (doc.orderNotes.checkout_method === "pickup") {

                          }
                          // var printerDB = db.get('printer')
                          // printerDB.findOne({}, {}, function(err, printer) {
                          // console.log(printer.printer_id)
                          if (doc.note_attributes[1] != undefined) {
                            // var options = {
                            //   screenSize: {
                            //     'width': 1350,
                            //     'height': 2200
                            //   }
                            // }
                            // var options2 = {
                            //   'width': 1350,
                            //   'height': 2200
                            // }
                            // console.log(doc._id)
                            // webshot("https://admin.alsflowersmontgomery.com/order/pdf/" + doc._id, "./public/pdf/" + doc._id + ".pdf", options, function(err) {
                            //   console.log(err)
                            //   // setTimeout(function() {
                            //   // 545151
                            //   var formData = {
                            //     "printer": 69637774,
                            //     "title": "Order: " + doc.order_number,
                            //     "contentType": "pdf_uri",
                            //     "content": "https://api.alsflowersmontgomery.com/pdf/" + doc._id + ".pdf",
                            //     "source": "api documentation!",
                            //     "options": {
                            //       "paper": "Legal",
                            //     }
                            //   }
                            //   var username = "7qPBLc9mtxCwF1vc53b4c774OhS5CbRMZfoxN3jy78A";
                            //   var password = "";
                            //   var url = "https://api.printnode.com/printjobs";
                            //   var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");
                            //
                            //   request.post({
                            //       url: url,
                            //       headers: {
                            //         "Authorization": auth
                            //       },
                            //       json: true,
                            //       body: formData
                            //     },
                            //     function(error, response, body) {
                            //       if (error) {
                            //         console.log(error)
                            //         // setTimeout(function() {
                            //         res.end();
                            //         // }, 1000)
                            //       } else {
                                    // console.log(response)
                                    console.log(moment().format('MMMM Do YYYY, h:mm a'));
                                    console.log('NEW ORDER#:' + doc.order_number)
                                    // setTimeout(function() {
                                    res.end();
                                    // }, 1000)
                            //       }
                            //     }
                            //   );
                            //
                            //   // }, 4000)
                            // });

                          } else {
                            res.end();
                          }
                          // })
                        } else {
                          res.send()
                        }
                      }
                    }
                  );
                }
              });
            }
          }
        );

      } else {
        doc.note = nl2br(doc.note);
        // console.log(doc.note);
        doc.deliver_day = "";
        if (doc.user_id) {

        } else {
          doc.user_id = "";
        }
        doc.orderNotes = {};

        for (i = 0; i < doc.note_attributes.length; i++) {
          var key = doc.note_attributes[i].name.replace(/ /g, "_").replace(/-/g, "_").toLowerCase();
          var value = doc.note_attributes[i].value.toString();
          doc.orderNotes[key] = value;
          if (i === doc.note_attributes.length - 1) {
            // console.log(doc.orderNotes)
          }
        }
        if (doc.orderNotes.checkout_method === "delivery" || doc.orderNotes.checkout_method === 'pickup') {
          // console.log(doc)
          if (doc.orderNotes.checkout_method === "delivery") {

          }

          if (doc.orderNotes.checkout_method === "pickup") {

          }
          // var printerDB = db.get('printer')
          // printerDB.findOne({}, {}, function(err, printer) {
          // console.log(printer.printer_id)
          if (doc.note_attributes[1] != undefined) {
            // var options = {
            //   screenSize: {
            //     'width': 1350,
            //     'height': 2200
            //   }
            // }
            // var options2 = {
            //   'width': 1350,
            //   'height': 2200
            // }
            // // console.log(doc._id)
            // webshot("https://admin.alsflowersmontgomery.com/order/pdf/" + doc._id, "./public/pdf/" + doc._id + ".pdf", options, function(err) {
            //   console.log(err)
            //   // setTimeout(function() {
            //   // 545151
            //   var formData = {
            //     "printer": 69637774,
            //     "title": "Order: " + doc.order_number,
            //     "contentType": "pdf_uri",
            //     "content": "https://api.alsflowersmontgomery.com/pdf/" + doc._id + ".pdf",
            //     "source": "api documentation!",
            //     "options": {
            //       "paper": "Legal",
            //     }
            //   }
            //   var username = "7qPBLc9mtxCwF1vc53b4c774OhS5CbRMZfoxN3jy78A";
            //   var password = "";
            //   var url = "https://api.printnode.com/printjobs";
            //   var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");
            //
            //   request.post({
            //       url: url,
            //       headers: {
            //         "Authorization": auth
            //       },
            //       json: true,
            //       body: formData
            //     },
            //     function(error, response, body) {
            //       if (error) {
            //         console.log(error)
            //         // setTimeout(function() {
            //         res.end();
            //         // }, 1000)
            //       } else {
                    // console.log(response)
                    console.log(moment().format('MMMM Do YYYY, h:mm a'));
                    console.log('NEW ORDER#:' + doc.order_number)
                    // setTimeout(function() {
                    res.end();
                    // }, 1000)
            //       }
            //     }
            //   );
            //
            //   // }, 4000)
            // });

          } else {
            res.end();
          }
          // })
        } else {
          res.send()
        }
      }

      ///////////////////////////////////////////////


    } else {

      var db = req.db;
      var ordersDB = db.get('orders')
      // ordersDB.insert(req.body)
      // console.log(req.body)
      var items = req.body.line_items;

      // ordersDB.findOne({
      //   "id": req.body.id
      ordersDB.insert(req.body, function(err, doc) {



        if (doc.source_name === 'subscription_contract') {
          console.log('SUBSCRIPTION CODE 2')
          var original_order = doc;
          console.log(doc.customer.id)
          var username = "36274b5cf78a52bfa4c6780ba48a2fb1";
          var password = "a26e549d188fe3459e1ed5b1c2cb1425";
          var url = "https://als-flowers.myshopify.com/admin/api/2021-01/customers/" + doc.customer.id + "/orders.json?status=any";
          var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

          request.get({
              url: url,
              headers: {
                "Authorization": auth
              },
            },
            function(error, response, body) {
              // console.log(response.headers.date)
              console.log(body)
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
                orders.slice(1).forEach(order => {
                  console.log(order.shipping_lines[0].title)
                  if (order.shipping_lines[0].title === 'Subscription shipping' || order.shipping_lines[0].title === 'Subscription · Shipping') {
                    var today = moment().format('YYYY/MM/DD')
                    var today_tag = moment().format('MM/DD/YYYY')
                    var order_tags = order.tags.split(',').slice(1);
                    console.log('OLD TAGS: ' + order_tags)
                    console.log(order.note_attributes)
                    console.log(order.tags)
                    console.log(original_order.id)
                    order_tags.push(today_tag)
                    order_tags.push(subscription_tag2)
                    // order_tags.join()
                    var new_tags = order_tags.join()
                    console.log(new_tags)
                    console.log('NEW TAGS: ' + new_tags)

                    console.log('TODAY: ' + today)
                    var dateIndex = order.note_attributes.findIndex(x => x.name === 'Delivery-Date');
                    var dateIndex2 = order.note_attributes.findIndex(x => x.name === 'Pickup-Date');
                    console.log(dateIndex)
                    if (dateIndex > -1) {
                      order.note_attributes[dateIndex] = {
                        "name": 'Delivery-Date',
                        "value": today
                      }
                    }
                    if (dateIndex2 > -1) {
                      order.note_attributes[dateIndex2] = {
                        "name": 'Pickup-Date',
                        "value": today
                      }
                    }

                    var formData2 = {
                      "order": {
                        "id": original_order.id,
                        "note": order.note,
                        "tags": new_tags,
                        "note_attributes": order.note_attributes
                      }
                    }
                    var username2 = "36274b5cf78a52bfa4c6780ba48a2fb1";
                    var password2 = "a26e549d188fe3459e1ed5b1c2cb1425";
                    var url2 = "https://als-flowers.myshopify.com/admin/api/2021-01/orders/" + original_order.id + ".json";
                    var auth2 = "Basic " + new Buffer(username2 + ":" + password2).toString("base64");

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
                        } else {
                          doc.note = nl2br(doc.note);
                          // console.log(doc.note);
                          doc.deliver_day = "";
                          if (doc.user_id) {

                          } else {
                            doc.user_id = "";
                          }
                          doc.orderNotes = {};

                          for (i = 0; i < doc.note_attributes.length; i++) {
                            var key = doc.note_attributes[i].name.replace(/ /g, "_").replace(/-/g, "_").toLowerCase();
                            var value = doc.note_attributes[i].value.toString();
                            doc.orderNotes[key] = value;
                            if (i === doc.note_attributes.length - 1) {
                              // console.log(doc.orderNotes)
                            }
                          }
                          if (doc.orderNotes.checkout_method === "delivery" || doc.orderNotes.checkout_method === 'pickup') {
                            // console.log(doc)
                            if (doc.orderNotes.checkout_method === "delivery") {

                            }

                            if (doc.orderNotes.checkout_method === "pickup") {

                            }
                            // var printerDB = db.get('printer')
                            // printerDB.findOne({}, {}, function(err, printer) {
                            // console.log(printer.printer_id)
                            if (doc.note_attributes[1] != undefined) {
                              // var options = {
                              //   screenSize: {
                              //     'width': 1350,
                              //     'height': 2200
                              //   }
                              // }
                              // var options2 = {
                              //   'width': 1350,
                              //   'height': 2200
                              // }
                              // // console.log(doc._id)
                              // webshot("https://admin.alsflowersmontgomery.com/order/pdf/" + doc._id, "./public/pdf/" + doc._id + ".pdf", options, function(err) {
                              //   console.log(err)
                              //   // setTimeout(function() {
                              //   // 545151
                              //   var formData = {
                              //     "printer": 69637774,
                              //     "title": "Order: " + doc.order_number,
                              //     "contentType": "pdf_uri",
                              //     "content": "https://api.alsflowersmontgomery.com/pdf/" + doc._id + ".pdf",
                              //     "source": "api documentation!",
                              //     "options": {
                              //       "paper": "Legal",
                              //     }
                              //   }
                              //   var username = "7qPBLc9mtxCwF1vc53b4c774OhS5CbRMZfoxN3jy78A";
                              //   var password = "";
                              //   var url = "https://api.printnode.com/printjobs";
                              //   var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");
                              //
                              //   request.post({
                              //       url: url,
                              //       headers: {
                              //         "Authorization": auth
                              //       },
                              //       json: true,
                              //       body: formData
                              //     },
                              //     function(error, response, body) {
                              //       if (error) {
                              //         console.log(error)
                              //         // setTimeout(function() {
                              //         res.end();
                              //         // }, 1000)
                              //       } else {
                                      // console.log(response)
                                      console.log(moment().format('MMMM Do YYYY, h:mm a'));
                                      console.log('NEW ORDER#:' + doc.order_number)
                                      // setTimeout(function() {
                                      res.end();
                                      // }, 1000)
                              //       }
                              //     }
                              //   );
                              //
                              //   // }, 4000)
                              // });

                            } else {
                              res.end();
                            }
                            // })
                          } else {
                            res.send()
                          }
                        }
                      }
                    );
                  }
                });
              }
            }
          );

        } else {
          doc.note = nl2br(doc.note);
          // console.log(doc.note);
          doc.deliver_day = "";
          if (doc.user_id) {

          } else {
            doc.user_id = "";
          }
          doc.orderNotes = {};

          for (i = 0; i < doc.note_attributes.length; i++) {
            var key = doc.note_attributes[i].name.replace(/ /g, "_").replace(/-/g, "_").toLowerCase();
            var value = doc.note_attributes[i].value.toString();
            doc.orderNotes[key] = value;
            if (i === doc.note_attributes.length - 1) {
              // console.log(doc.orderNotes)
            }
          }
          if (doc.orderNotes.checkout_method === "delivery" || doc.orderNotes.checkout_method === 'pickup') {
            // console.log(doc)
            if (doc.orderNotes.checkout_method === "delivery") {

            }

            if (doc.orderNotes.checkout_method === "pickup") {

            }
            // var printerDB = db.get('printer')
            // printerDB.findOne({}, {}, function(err, printer) {
            // console.log(printer.printer_id)
            if (doc.note_attributes[1] != undefined) {
              // var options = {
              //   screenSize: {
              //     'width': 1350,
              //     'height': 2200
              //   }
              // }
              // var options2 = {
              //   'width': 1350,
              //   'height': 2200
              // }
              // // console.log(doc._id)
              // webshot("https://admin.alsflowersmontgomery.com/order/pdf/" + doc._id, "./public/pdf/" + doc._id + ".pdf", options, function(err) {
              //   console.log(err)
              //   // setTimeout(function() {
              //   // 545151
              //   var formData = {
              //     "printer": 69637774,
              //     "title": "Order: " + doc.order_number,
              //     "contentType": "pdf_uri",
              //     "content": "https://api.alsflowersmontgomery.com/pdf/" + doc._id + ".pdf",
              //     "source": "api documentation!",
              //     "options": {
              //       "paper": "Legal",
              //     }
              //   }
              //   var username = "7qPBLc9mtxCwF1vc53b4c774OhS5CbRMZfoxN3jy78A";
              //   var password = "";
              //   var url = "https://api.printnode.com/printjobs";
              //   var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");
              //
              //   request.post({
              //       url: url,
              //       headers: {
              //         "Authorization": auth
              //       },
              //       json: true,
              //       body: formData
              //     },
              //     function(error, response, body) {
              //       if (error) {
              //         console.log(error)
              //         // setTimeout(function() {
              //         res.end();
              //         // }, 1000)
              //       } else {
                      // console.log(response)
                      console.log(moment().format('MMMM Do YYYY, h:mm a'));
                      console.log('NEW ORDER#:' + doc.order_number)
                      // setTimeout(function() {
                      res.end();
                      // }, 1000)
              //       }
              //     }
              //   );
              //
              //   // }, 4000)
              // });

            } else {
              res.end();
            }
            // })
          } else {
            res.send()
          }
        }
      })
    }
  })



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

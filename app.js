var createError = require('http-errors');

var express = require('express');
var path = require('path');

var mongoose = require('mongoose');
// mongoose.set('useNewUrlParser', true);
// mongoose.set('useUnifiedTopology', true);
var passport = require('passport');
var flash = require('connect-flash');
var timeout = require('connect-timeout'); //express v4



// var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var session = require('express-session');
var MongoClient = require('mongodb').MongoClient;

var assert = require('assert');
var mongo = require('mongodb');
var monk = require('monk');
// var db = monk('mongodb://jacksrf2:trey3333@ds155461.mlab.com:55461/als-flowers-api');
var db = monk('mongodb+srv://jacksrf:trey3333@als-flowers-api.oou3u.mongodb.net/als-flowers-api?retryWrites=true&w=majority');
console.log(db.collection)

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

// var routes = require('./routes/index');
// var admin = require('./routes/admin.js');
// var users = require('./routes/users');
var loginRoute = require('./routes/login.js');

var app = express();

var configDB = require('./config/database.js');
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(timeout(120000000));
app.use(haltOnTimedout);


app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(logger('dev'));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(configDB.url);
require('./config/passport.js');

app.use(session({ secret:'YOUR_SECRET_HERE' }));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', req.get('Origin') || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
  res.header('Access-Control-Expose-Headers', 'Content-Length');
  res.header('Access-Control-Allow-Headers', 'Accept, Authorization, Content-Type, X-Requested-With, Range');
  if (req.method === 'OPTIONS') {
    return res.send(200);
  } else {
    return next();
  }
});

function haltOnTimedout(req, res, next){
  if (!req.timedout) next();
}

app.use(function(req,res,next){
    req.db = db;
    next();
});

app.use('/', indexRouter, loginRoute);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;

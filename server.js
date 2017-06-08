const express = require('express');
const path = require('path');
const hbs = require('hbs');
const fs = require('fs');
const redis = require('redis');
const helmet = require('helmet');
const _ = require('lodash');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

var app = express();
var redisClient = redis.createClient();
var staticPath = path.join(__dirname, 'public');
var partialsPath = path.join(__dirname, 'views/partials');
var port = process.env.PORT || 47599;
var siteName = 'BlueSky VHS';

redisClient.on('error', function (err) {
    console.log('Error ' + err);
});

app.set('view engine', 'hbs');

app.use(helmet());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use((req, res, next) => {
  var now = new Date().toISOString();
  var log = `${now}: ${req.method} ${req.url}`;
  console.log(log);
  fs.appendFile('logs/server.log', log + '\n', (err) => {
    if (err) {
      console.log(`${now}: ${err}`);
    }
  });
  next();
});

// // Maintenece
// app.use((req, res, next) => {
//   res.send('<h1>Maintenece</h1>');
// });

app.use(express.static(staticPath));

hbs.registerPartials(partialsPath);
hbs.registerHelper('getCurrentYear', currentYear());

app.get('/', (req, res) => {
  res.render('index', {
    title:  siteTitle('Home'),
    message: 'Oh, shut up!'
  });
});

app.get('/about', (req, res) => {
  res.render('about', {
    title:  siteTitle('About')
    // message: 'Oh, shut up!',
  });
});

app.get('/videos', (req, res) => {
  res.render('videos', {
    title: siteTitle('Videos')
  });
});

app.get('/register', (req, res) => {
  setToken(2);
  res.render('register');
});

app.post('/register', (req, res) => {
  var userData = (_.pick(req.body, ['user', 'email', 'password']));

  userValidator(userData).then(() => {
    return userRegistrator(userData);
  }).then((userId) => {
    return assignToken(userId, setToken(userId));
  }).then((token) => {
    res.cookie('auth', token);
    res.redirect('/');
  }).catch((error) => {
    res.render('register', {error: error});
  });
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  console.log(req.body);
  // var userData = (_.pick(req.body, ['user', 'password']));

  // console.log(userData.password);

  // bcrypt.genSalt(10, (err, salt) => {
  //   bcrypt.hash(userData.password, salt, (err, hash) => {
  //     console.log(hash);
  //   });
  // });

  res.render('login');
});

app.listen(port, () => {
  console.log(`Server is up on port ${port}`);
});

function siteTitle(pageTitle) {
  return `${pageTitle} | ${siteName}`;
}

function currentYear() {
  return new Date().getFullYear();
}

function userValidator(userData) {
  return new Promise((resolve, reject) => {
    if (!validator.isEmail(userData.email)) {
      reject('Eneter a valid e-mail');
    } else if (validator.isEmpty(userData.password)){
      reject('Password must not be empty');
    } else {
      resolve(true);
    }
  });
}

function passwordToHash(password) {
  return new Promise((resolve, reject) => {
    bcrypt.genSalt(10, (err, salt) => {
      if (err) {
        reject('Internal error');
      } else {
        bcrypt.hash(password, salt, (err, hash) => {
          if (err) {
            reject('Internal error');
          } else {
            resolve(hash);
          }
        });
      }
    });
  });
}

function userRegistrator(userData) {
  return new Promise((resolve, reject) => {
    redisClient.hget('users', userData.email, (err, id) => {
      if (err) {
        reject('Databse error');
      } else if (id) {
        reject('User already exists');
      } else {
        userData.email = validator.normalizeEmail(userData.email);
        passwordToHash(userData.password).then((passwordHash) => {
          redisClient.incr('next_user_id', (err, next_user_id) => {
            if (err) {
              reject('Databse error');
            } else {
              redisClient.hmset(
                `user:${next_user_id}`,
                [
                  'email', userData.email,
                  'password_hash', passwordHash
                ],
                (err, reply) => {
                  redisClient.hset(
                    'users', [ userData.email, next_user_id], (err, reply) => {
                      if (err) {
                        reject('Databse error');
                      } else {
                        resolve(next_user_id);
                      }
                    });
                });
            }
          });
        }).catch((error) => {
          reject(error);
        });
      }
    });
  });
}

function setToken(userId) {
  return jwt.sign({ userId: 'auth' }, '234563bjknrlfmb').toString();
}

function assignToken(userId, token) {
  return new Promise((resolve, reject) => {
    redisClient.hset(`user:${userId}`, ['auth', token], (err, reply) => {
      if (err) {
        reject('Database error');
      } else {
        redisClient.hset('auths', [token, userId], (err, reply) => {
          if (err) {
            reject('Database error');
          } else {
            resolve(token);
          }
        });
      }
    });
  });
}


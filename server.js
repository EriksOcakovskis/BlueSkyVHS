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
const multer  = require('multer');

var app = express();
var redisServer = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
var redisClient = redis.createClient(redisServer);
var uploadsPath = path.join(__dirname, 'public/uploads');
var partialsPath = path.join(__dirname, 'views/partials');
var port = process.env.PORT || 47599;
var siteName = 'BlueSky VHS';
var upload = multer({
  dest: __dirname + '/public/uploads/',
  limits: {fileSize: 20000000, files:1}
});

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

app.use(express.static(uploadsPath));

hbs.registerPartials(partialsPath);
hbs.registerHelper('getCurrentYear', currentYear());

app.get('/', isLoggedIn, (req, res) => {
  res.render('index', {
    title:  siteTitle('Home'),
    message: 'Oh, shut up!',
    user: req.user
  });
});

app.get('/about', isLoggedIn, (req, res) => {
  res.render('about', {
    title:  siteTitle('About'),
    user: req.user
    // message: 'Oh, shut up!',
  });
});

app.get('/videos', authenticate, (req, res) => {
  allVideos().then((videos) => {
    res.render('videos', {
      title: siteTitle('Videos'),
      user: req.user,
      videos: videos,
    });
  }).catch((error) => {
    res.render('videos', {
      title: siteTitle('Videos'),
      user: req.user,
      error: error
    });
  });
});

app.get('/videos/upload', authenticate, (req, res) => {
  res.render('videos_upload', {
    title: siteTitle('Upload Videos'),
    user: req.user
  });
});

app.post('/videos/upload', authenticate, upload.single('video'), (req, res) => {
  console.log(req.file);
  videToDb(req.file.filename, req.user).then(() => {
    res.redirect('/videos');
  }).catch((error) => {
    fs.unlink(uploadsPath + '/' + req.file.filename);
    res.redirect('/videos/upload');
  });
});

app.get('/register', isLoggedIn,(req, res) => {
  if (req.user) {
    res.redirect('/');
  } else {
    res.render('register', {
      title: siteTitle('Register'),
      user: req.user
    });
  }
});

app.post('/register', isLoggedIn, (req, res) => {
  if (req.user){
    res.redirect('/');
  } else {
    var userData = (_.pick(req.body, ['email', 'password']));

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
  }
});

app.get('/login', isLoggedIn, (req, res) => {
    if (req.user) {
    res.redirect('/');
  } else {
    res.render('login', {
      title: siteTitle('Login'),
      user: req.user
    });
  }
});

app.post('/login', isLoggedIn, (req, res) => {
    if (req.user) {
    res.redirect('/');
  } else {
    console.log(req.body);
    var userData = (_.pick(req.body, ['email', 'password']));

    userValidator(userData).then(() => {
      return credentialsToUser(userData);
    }).then((user) => {
      res.cookie('auth', user.auth);
      res.redirect('/');
    }).catch((error) =>{
      res.render('login', {error: error});
    });
  }
});

app.get('/logout', isLoggedIn, (req, res) => {
  if (req.user) {
    res.clearCookie('auth');
    res.redirect('/');
  } else {
    res.redirect('/');
  }
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
      reject('Enter a valid e-mail');
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

function authenticate(req, res, next) {
  var token = req.cookies.auth;
  tokenToUser(token).then((user) => {
    if (!user) {
      return Promise.reject();
    }
    req.user = user;
    next();
  }).catch((error) => {
    console.log(error);
    res.redirect('/');
  });
}

function isLoggedIn(req, res, next) {
  var token = req.cookies.auth;
  tokenToUser(token).then((user) => {
    if (!user) {
      return Promise.reject();
    }
    req.user = user;
    next();
  }).catch((error) => {
    console.log(error);
    next();
  });
}

function tokenToUser(token) {
  return new Promise((resolve, reject) => {
    redisClient.hget('auths', token, (err, id) => {
      if (err) {
        reject('Database error');
      } else if (!id) {
        reject('User not found');
      } else {
        redisClient.hgetall(`user:${id}`, (err, user) => {
          if (err) {
            reject('Database error');
          } else {
            resolve(user);
          }
        });
      }
    });
  });
}

function credentialsToUser(userData) {
  return new Promise((resolve, reject) => {
    userData.email = validator.normalizeEmail(userData.email);
    redisClient.hget('users', userData.email, (err, id) => {
      if (err) {
        reject('Databse error');
      } else if (!id) {
        reject('Wrong credentials');
      } else {
        redisClient.hgetall(`user:${id}`, (err, user) => {
          if (err) {
            reject('Database error');
          } else {
            bcrypt.compare(userData.password, user.password_hash).then((reply) => {
              resolve(user);
            }).catch((error) => {
              reject('Wrong credentials');
            });
          }
        });
      }
    });
  });
}

function allVideos() {
  return new Promise((resolve, reject) => {
    redisClient.LRANGE('videos', 0, -1, (err, videos) => {
      if (err) {
        reject('Databse error');
      } else if (videos === undefined || videos.length == 0) {
        reject('No videos found');
      } else {
        resolve(videos);
      }
    });
  });
}

function videToDb(file, userData) {
  return new Promise((resolve, reject) => {
    redisClient.hget('users', userData.email, (err, id) => {
      if (err) {
        reject('Databse error');
      } else {
        redisClient.rpush('videos', file, (err, reply) => {
          if (err) {
            reject('Databse error');
          } else {
            resolve();
          }
        });
      }
    });
  });
}


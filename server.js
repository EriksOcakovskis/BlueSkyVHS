const express = require('express');
const path = require('path');
const hbs = require('hbs');
const fs = require('fs');

var app = express();
var staticPath = path.join(__dirname, 'public');
var partialsPath = path.join(__dirname, 'views/partials');
var port = process.env.PORT || 47599;
var siteName = 'BlueSky VHS';

app.set('view engine', 'hbs');

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
    title:  `Home | ${siteName}`,
    message: 'Oh, shut up!'
  });
});

app.get('/about', (req, res) => {
  res.render('about', {
    title:  `About | ${siteName}`
    // message: 'Oh, shut up!',
  });
});

app.get('/bad', (req, res) => {
  res.send({
    errorMessage: 'Bad request 400'
  });
});

app.listen(port, () => {
  console.log(`Server is up on port ${port}`);
});

function currentYear() {
  return new Date().getFullYear();
}
//jshint node: true
var cozydb  = require('cozydb'),
    winston = require('winston'),
    Model, modelOptions;

modelOptions = {
  curlPassword: {
    'type': String,
    'default': ''
  }
};

Model = cozydb.getModel('HasteSettings', modelOptions);

Model.defineRequest('all', cozydb.defaultRequests.all, function (err) {
  "use strict";
  if (err) {
    winston.error("Error defining request:", err);
  }
});

function Settings(options) {
  "use strict";
}

Settings.prototype.get = function (cb) {
  "use strict";
  Model.all(cb);
};
Settings.prototype.set = function (settings, cb) {
  "use strict";
  if (settings._id) {
    Model.save(settings._id, settings, function (err, res) {
      // There's a bug in CozyDB, it doesn't return the updated object
      cb(err, settings);
    });
  } else {
    Model.create(settings, cb);
  }
};

module.exports = Settings;

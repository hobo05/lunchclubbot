var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var userSchema = Schema({
  _id     : String,
  name    : String
});

module.exports = mongoose.model('User', userSchema);
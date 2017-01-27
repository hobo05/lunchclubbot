var mongoose = require("mongoose");

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var teamSchema = Schema({
  _id     : String
});

module.exports = mongoose.model('Team', teamSchema);
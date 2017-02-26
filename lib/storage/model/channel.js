var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var channelSchema = Schema({
  _id     : String
});

module.exports = mongoose.model('Channel', channelSchema);
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var restaurantSchema = Schema({
  name    : {type: String, unique:true, required: true}
});

module.exports = mongoose.model('Restaurant', restaurantSchema);
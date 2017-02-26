var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var restaurantRatingSchema = Schema({
	user 			: { type: String, ref: 'User', required: true},
  	restaurant    : { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  	ratings 		: [{ type: Number, required: true}]
});

module.exports = mongoose.model('RestaurantRating', restaurantRatingSchema);
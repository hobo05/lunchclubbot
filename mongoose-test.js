const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Use native promises
mongoose.Promise = global.Promise;



mongoose.connect('mongodb://dbuser:dbuser@ds129459.mlab.com:29459/lunchclubdb');


var teamSchema = Schema({
  _id     : String
});

var channelSchema = Schema({
  _id     : String
});

const userSchema = Schema({
  _id     : String,
  name    : String
});

var restaurantSchema = Schema({
  name    : {type: String, required: true}
});

var restaurantRatingSchema = Schema({
	user 			: { type: String, ref: 'User', required: true},
  	restaurant    : { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  	rating 		: { type: Number, required: true}
});

var Team = mongoose.model('Team', teamSchema);
var Channel = mongoose.model('Channel', channelSchema);
var User = mongoose.model('User', userSchema);
var Restaurant = mongoose.model('Restaurant', restaurantSchema);
var RestaurantRating = mongoose.model('RestaurantRating', restaurantRatingSchema);

// TEST DATA
const TEST_USER_ID = "U3H9SR5B5";
const TEST_REST_NAME = "Blue Asia";

// Save

var testUser = new User({_id: TEST_USER_ID, name: "test"});
var testRestaurant = new Restaurant({name: TEST_REST_NAME});

if (process.argv[2] === "save") {
	Promise.all([
		testUser.save(), 
		testRestaurant.save()
	])
	.then(function(resultSaves) {

	    console.log('parallel promise save result :');
	    console.log(resultSaves);

	    var testRating = new RestaurantRating({user: testUser.id, restaurant: testRestaurant.id, ratings: [3.5]});
	    return testRating.save();

	}).then(function (ratingSaved) {
		console.log("rating saved: " + ratingSaved);
		
		return RestaurantRating.findOne({user: testUser.id}).populate('user restaurant');
	}).then(function (retrievedRating) {
		console.log("retrievedRating: " + retrievedRating);

		mongoose.disconnect();	
	}).catch(function(err) {

	    console.log('ERROR on promise save :');
	    console.log(err);
	    mongoose.disconnect();
	});
} else if (process.argv[2] === "delete") {

// Delete

	Promise.all([
		User.findOneAndRemove({_id: /u.*/i}), 
		Restaurant.findOneAndRemove({name: /blue.*/i}),
		RestaurantRating.findOneAndRemove({user: testUser.id})
	])
	.then(function(resultRemoves) {

	    console.log('parallel promise remove result :');
	    console.log(resultRemoves);
	    mongoose.disconnect();

	}).catch(function(err) {

	    console.log('ERROR on promise remove :');
	    console.log(err);
	    mongoose.disconnect();
	});
}

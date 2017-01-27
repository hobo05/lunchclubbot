/*
* Botkit Storage implemented with MongoDB and Mongoose
* 
* @author tcheng
*/
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// Use bluebird promises
mongoose.Promise = require('bluebird');
var models = require('require-dir-all')('model');

module.exports = function(config) {

    if (!config || !config.url) {
        throw new Error("You must provide a mongodb url");
    }

    // connect to mongo
    mongoose.connect(config.url);

    var Team = models.team;
    var User = models.user;
    var Channel = models.channel;
    var Restaurant = models.restaurant;
    var RestaurantRating = models.restaurantRating;

    // Return JSON objects with getters with .lean() is called
    Team.schema.set('toObject', { getters: true });
    User.schema.set('toObject', { getters: true });
    Channel.schema.set('toObject', { getters: true });
    Restaurant.schema.set('toObject', { getters: true });
    RestaurantRating.schema.set('toObject', { getters: true });

    var storage = {
        teams: {
            get: function(team_id, cb) {
                Team.findById(team_id).exec(cb);
            },
            save: function(team, cb) {
                Team.findByIdAndUpdate(team.id, team, {upsert:true, new:true}).exec(cb);
            },
            delete: function(team, cb) {
                Team.findByIdAndRemove(team.id).exec(cb);
            },
            all: function(cb) {
                Team.find({}).exec(cb);
            },
            model: Team
        },
        users: {
            get: function(user_id, cb) {
                User.findById(user_id).exec(cb);
            },
            save: function(user, cb) {
                User.findByIdAndUpdate(user.id, user, {upsert:true, new:true}).exec(cb);
            },
            delete: function(user, cb) {
                User.findByIdAndRemove(user.id).exec(cb);
            },
            all: function(cb) {
                User.find({}).exec(cb);
            },
            model: User
        },
        channels: {
            get: function(channel_id, cb) {
                Channel.findById(channel_id).exec(cb);
            },
            save: function(channel, cb) {
                Channel.findByIdAndUpdate(channel.id, channel, {upsert:true, new:true}).exec(cb);
            },
            delete: function(channel, cb) {
                Channel.findByIdAndRemove(channel.id).exec(cb);
            },
            all: function(cb) {
                Channel.find({}).exec(cb);
            },
            model: Channel
        },
        restaurants: {
            get: function(restaurant_id, cb) {
                Restaurant.findById(restaurant_id).exec(cb);
            },
            save: function(restaurant, cb) {
                if (!restaurant.id) {
                    new Restaurant(restaurant).save(cb);
                } else {
                    Restaurant.findByIdAndUpdate(restaurant.id, restaurant).exec(cb);
                }
            },
            delete: function(restaurant, cb) {
                Restaurant.findByIdAndRemove(restaurant.id).exec(cb);
            },
            all: function(cb) {
                Restaurant.find({}).exec(cb);
            },
            model: Restaurant
        },
        restaurantRatings: {
            get: function(restaurant_rating_id, cb) {
                RestaurantRating.findById(restaurant_rating_id).populate('user restaurant').exec(cb);
            },
            save: function(restaurant_rating, cb) {
                if (!restaurant_rating.id) {
                    new RestaurantRating(restaurant_rating).save(cb);
                } else {
                    RestaurantRating.findByIdAndUpdate(restaurant_rating.id, restaurant_rating).exec(cb);
                }
            },
            delete: function(restaurant_rating, cb) {
                RestaurantRating.findByIdAndRemove(restaurant_rating.id).exec(cb);
            },
            all: function(cb) {
                RestaurantRating.find({}).populate('user restaurant').exec(cb);
            },
            getByUserId: function (user_id, cb) {
                RestaurantRating.find({user: user_id}).populate('user restaurant').exec(cb);
            },
            model: RestaurantRating
        },
        models: models
    };

    return storage;
};

/*
*
* Lunchclub bot
*/

require('dotenv').config();

if (!process.env.SLACK_TOKEN) {
    console.log('Error: Specify slack bot token in environment (e.g. SLACK_TOKEN=abc)');
    process.exit(1);
}

if (!process.env.MONGODB_URL) {
    console.log('Error: Specify slack bot token in environment (e.g. MONGODB_URL=mongodb://user:password@test.com)');
    process.exit(1);
}

// Mongo Storage
var mongo_storage = require('./lib/storage/mongo_storage.js')({url: process.env.MONGODB_URL});

var Botkit = require('./lib/Botkit.js');
var os = require('os');
var Fuse = require('fuse.js');
var _ = require('lodash');

var controller = Botkit.slackbot({
    // json_file_store: 'lunchbotbrain',
    storage: mongo_storage,
    // debug: true,
});

var bot = controller.spawn({
    token: process.env.SLACK_TOKEN
}).startRTM();


// Blue bird
var Promise = require("bluebird");

// Promisify all storage methods
_.forEach(controller.storage, entity => Promise.promisifyAll(entity));

// Promisify bot methods
Promise.promisifyAll(bot);

function randResponse(responses) {
    return responses[_.random(responses.length-1)];
}

function randFruit() {
    return randResponse(fruits).toLowerCase();
}

function starString(rating) {
    if (rating === 0) {
        return ":o:";
    }

    var ratingWhole = _.floor(rating);
    
    var starString = "";
    for (var i = 0; i < ratingWhole; i++) {
        if (i === 4) {
            starString += ":star2:";
        } else {
            starString += ":star:";
        }
    }

    var decimal = rating - ratingWhole;
    if (decimal > 0) {
        starString += String(decimal).replace(/0/, '');
    }

    return starString;
}

function sanitizeName(name) {
    return _.startCase(name.replace(/(&amp;)|&/g, "And"));
}

function fatalError(message, error, customMessage) {
    console.error("*******Fatal Error******* " + customMessage + "\n", error);
    bot.reply(message, ":face_with_head_bandage: *My brain exploded:* _" + customMessage + "_");
}

class Restaurant {
  constructor(name) {
    this.name = name;
  }
}

// Fuse options
const DEFAULT_FUSE_OPTIONS = {
    include: ["score"],
    shouldSort: true,
    threshold: 0.4,
}

// Options to search by restaurant name
var tempOptions = _.clone(DEFAULT_FUSE_OPTIONS);
tempOptions.keys = ["restaurant.name"];
const SEARCH_NAME_OPTIONS = tempOptions;


/**********************************************
********** Start - Conversations **************
**********************************************/

// Conversation Variables
const VAR_NAME = "name";
const VAR_TEAM = "team";
const VAR_USER = "user";
const VAR_STARS = "stars";
const VAR_FUSE_RESULTS = "fuseResults";
const VAR_NEW_RESTAURANT = "newRestaurant";
const VAR_CHOSEN_RESTAURANT = "chosenRestaurant";

// Conversation threads
const ASK_NAME = "ask_name";
const NEW_RESTAURANT = "new_restaurant";
const CLARIFY_RESTAURANT = 'clarify_restaurant';
const CHOOSE_RESTAURANT = 'choose_restaurant';
const RATE_RESTAURANT = 'rate_restaurant';

/***********************
Start - ASK_NAME
***********************/

var askName = function(convo, callback) {
    convo.addMessage('I do not know your name yet!', ASK_NAME);
    convo.addQuestion('What should I call you?', function(response, convo) {
        var name = response.text;

        convo.addQuestion('You want me to call you `' + name + '`?', [
            {
                pattern: bot.utterances.yes,
                callback: function(response, convo) {
                    var user = convo.vars[VAR_USER];
                    convo.next();
                }
            },
            {
                pattern: bot.utterances.no,
                callback: function(response, convo) {
                    delete convo.vars[VAR_NAME];    // remove the name
                    convo.stop();
                }
            },
            {
                default: true,
                callback: function(response, convo) {
                    convo.addMessage("Get that ear wax out and try again.");
                    convo.repeat();
                    convo.next();
                }
            }
        ],
        {},
        ASK_NAME);

        convo.next();
    }, 
    {key: "username"},
    ASK_NAME); 
};

var askNameConvo = function(message, user) {
    return bot.createConversationAsync(message).then(convo => {
        var user = createUser(message, user);
        convo.setVar(VAR_USER, user);

        askName(convo);
        convo.gotoThread(ASK_NAME);

        var convoEndPromise = new Promise(function (resolve, reject) {
            convo.on("end", function (convo) {
                if (convo.status === "completed") {
                    user.name = convo.extractResponse("username");
                    resolve(controller.storage.users.saveAsync(user));
                } else if (convo.status === "stopped") {
                    bot.reply(message, "I didn't want to know your name anyway!");
                    resolve(user);
                }
            });
        });

        convo.activate();

        return convoEndPromise;
    });
}

/***********************
End - ASK_NAME
***********************/

/***********************
Start - NEW_RESTAURANT
***********************/
var newRestaurantSetup = function(convo) {
    var team = convo.vars[VAR_TEAM];
    var newRestaurant = convo.vars[VAR_NEW_RESTAURANT];

    convo.addQuestion('Is {{vars.newRestaurant}} a new restaurant?', [
        {
            pattern: bot.utterances.yes,
            callback: function(response,convo) {
                // Create document and save it to convo
                convo.setVar(VAR_CHOSEN_RESTAURANT, newRestaurant);
                rateRestaurantSetup(convo);
                convo.gotoThread(RATE_RESTAURANT);
            }   
        },
        {
            pattern: bot.utterances.no,
            callback: function(response,convo) {
                convo.stop();
            }
        },
        {
            default: true,
            callback: function(response,convo) {
              // just repeat the question
              convo.addMessage('Answer the damn question.', NEW_RESTAURANT);
              convo.repeat();
              convo.next();
            }
        }
    ],
    {},
    NEW_RESTAURANT);
}
/***********************
End - NEW_RESTAURANT
***********************/

/**************************
Start - CLARIFY_RESTAURANT
**************************/
var clarifyRestaurantSetup = function(convo, yesThread, noThread) {
    convo.addQuestion('Did you mean one of the following?\n {{vars.matches}}', [
          {
            pattern: bot.utterances.yes,
            callback: function(response,convo) {
                convo.gotoThread(yesThread);
            }
          },
          {
            pattern: bot.utterances.no,
            callback: function(response,convo) {
                convo.gotoThread(noThread);
            }
          },
          {
            default: true,
            callback: function(response,convo) {
              // just repeat the question
              convo.addMessage('Answer the damn question.', CLARIFY_RESTAURANT);
              convo.repeat();
              convo.next();
            }
          }
        ], 
        {}, // capture options
        CLARIFY_RESTAURANT
    );
}
/**************************
End - CLARIFY_RESTAURANT
**************************/

/**************************
Start - CHOOSE_RESTAURANT
**************************/
var chooseRestaurantSetup = function(convo, yesThread, callback) {

    convo.addQuestion('Which one?', function(response, convo) {
            var restaurantNames = convo.vars[VAR_FUSE_RESULTS];
            var responseRestaurant = sanitizeName(response.text);

            if (response.text.match(/(stop)|(end)|(forget it)/i)) {
                convo.stop();
            } else if (_.includes(restaurantNames, responseRestaurant)) {
                convo.setVar(VAR_CHOSEN_RESTAURANT, responseRestaurant);

                // Only call callback if it exists
                if (callback) {
                    callback(convo);
                }

                convo.gotoThread(yesThread);
            } else {
                convo.addMessage("Can you spell? Try again.", CHOOSE_RESTAURANT);
                convo.repeat();
            }
            convo.next();
        }, 
        {}, // capture options
        CHOOSE_RESTAURANT
    );
}
/**************************
End - CHOOSE_RESTAURANT
**************************/

/**************************
Start - RATE_RESTAURANT
**************************/
var rateRestaurantSetup = function(convo) {
    var team = convo.vars[VAR_TEAM];
    var user = convo.vars[VAR_USER];
    var stars = convo.vars[VAR_STARS];
    var chosenRestaurantName = convo.vars[VAR_CHOSEN_RESTAURANT];

    controller.storage.restaurants.save(new Restaurant(chosenRestaurantName), function (err, savedRestaurant) {
        controller.storage.restaurantRatings.getByUserId(user.id, function (err, allUserRatings) {
           var restaurantRating = _.find(allUserRatings, ['restaurant.name', chosenRestaurantName]);

            if (!restaurantRating) {
                convo.addMessage("You've never rated {{vars.chosenRestaurant}} before", RATE_RESTAURANT);
                convo.addMessage(starString(stars) + ' for {{vars.chosenRestaurant}}. Now go out and run a lap, fat ass.', RATE_RESTAURANT);
                restaurantRating = {user: user._id, restaurant: savedRestaurant._id, ratings: []};
            } else if (restaurantRating.ratings.length > 0) {
                var lastRating = _.last(restaurantRating.ratings);

                convo.addMessage('You last rated it: ' + starString(lastRating), RATE_RESTAURANT);
                convo.addMessage(starString(stars) + ' for {{vars.chosenRestaurant}}. Aren\'t you getting a little chubby to be eating out?', RATE_RESTAURANT);

                if (stars > lastRating) {
                    convo.addMessage('You feeling good about it huh? Did they give you free food?', RATE_RESTAURANT);
                } else if (stars < lastRating) {
                    convo.addMessage('Did someone shit in your food?', RATE_RESTAURANT);
                } else {
                    convo.addMessage('Same restaurant, same food, same rating, same job, same boring life. You\'re going nowhere. Admit it.', RATE_RESTAURANT);
                }
            }

            
            restaurantRating.ratings.push(stars);

            controller.storage.teams.save(team, function(err, savedTeam) {
                controller.storage.users.save(user, function(err, savedUser) {
                    controller.storage.restaurantRatings.save(restaurantRating, function (err, savedRating) {
                        convo.next();
                    })
                });
            });
        });
    });
};
/**************************
End - RATE_RESTAURANT
**************************/

/**********************************************
********** End - Conversations **************
**********************************************/

controller.hears('^help$','ambient,direct_message,direct_mention,mention', function(bot, message) {
    bot.reply(message, randResponse([
        'I\'d rather not. You smell like ' + randFruit() + ' farts', 
        'No, ' + randFruit() + ' face!', 
        'I would...but I don\'t like you',
        'Fine...you can use the following. You can figure out if you need to mention me or not with that fantastic brain of yours: ' + [
        '',
        '*help*',
        '*hello*',
        '*(stars) stars for (place)*',
        '*my (place) rating*',
        '*lunch club (place) ratings*',
        '*search (place) in (location)*',
        '*search (place)*',
        '*reviews for (place)*',
        '*menu for (place)*',
        '*set location (location)*',
        '*where are we*',
        '*call me (name)*',
        '*my name is (name)*',
        '*who am i*',
        '*what is my name*',
        '*who are you*',
        '*do you like me*',
        '*tell (person) (something)*'
        ].join('\n - ')]));
});

controller.hears('((damn|screw|fuck|hate) you)|([a-z]+ off)|(go [a-z]+ yourself)','direct_message,direct_mention,mention', function(bot, message) {
    bot.reply(message, randResponse([
        'You\'re the biggest mistake your mom and I ever made.',
        'Whaa, whaa, whaa, "' + message.text + '". Why don\'t you grow a :pear:?',
        'Did it take you all day to come up with that?'
        ]));
});

controller.hears('^tell (?:[a-z]+) (.+)','direct_message,direct_mention,mention', function(bot, message) {
    var stuffToTell = message.match[1];
    bot.reply(message, randResponse([
        'I told your mom last night ' + stuffToTell,
        'Why don\'t you say it yourself, coward?',
        'I\'ll get right on it...not'
        ]));
});

controller.hears('^my (.+) (?:(?:ratings?)|(?:stars))$','ambient,direct_message,direct_mention,mention', function(bot, message) {
    var restaurant = sanitizeName(message.match[1]);

    var userPromise = controller.storage.users.getAsync(message.user);
    var allUserRatingsPromise = userPromise.then(user => controller.storage.restaurantRatings.getByUserIdAsync(user.id));
    var convoPromise = bot.startConversationAsync(message);

    Promise.join(userPromise, allUserRatingsPromise, convoPromise, (user, allUserRatings, convo) => {

        user = createUser(message, user);
        convo.setVar(VAR_CHOSEN_RESTAURANT, restaurant);

        const NEVER_RATED = "never_rated";
        const YOUR_RATING = "your_rating";
        const VAR_LAST_RATING = "lastRating";

        convo.addMessage("You never rated {{vars.chosenRestaurant}}, genius.", NEVER_RATED);
        convo.addMessage("Your last {{vars.chosenRestaurant}} rating was {{vars.lastRating}}", YOUR_RATING);

        clarifyRestaurantSetup(convo, CHOOSE_RESTAURANT, NEVER_RATED);
        chooseRestaurantSetup(convo, YOUR_RATING, function (convo) {
            var chosenRestaurant = convo.vars[VAR_CHOSEN_RESTAURANT];
            // console.log("======" + JSON.stringify(chosenRestaurant));
            var ratingObject = _.find(allUserRatings, ["restaurant.name", chosenRestaurant]);
            // console.log("======" + JSON.stringify(ratingObject));
            var lastRating =  _.last(ratingObject.ratings);
            convo.setVar(VAR_LAST_RATING, starString(lastRating));
        });

        var fuse = new Fuse(allUserRatings, SEARCH_NAME_OPTIONS);
        var results = fuse.search(restaurant);
        console.log("=========results=" + JSON.stringify(results));
        var firstResult = results[0];

        if (firstResult && firstResult.score === 0) {
            var lastRating =  _.last(firstResult.item.ratings);
            convo.setVar(VAR_LAST_RATING, starString(lastRating));
            convo.gotoThread(YOUR_RATING);
        } else if (results.length > 0) {
            // Set newRestaurant var
            convo.setVar(VAR_NEW_RESTAURANT, restaurant);
            var restaurantNames = _.map(results, "item.restaurant.name");
            convo.setVar(VAR_FUSE_RESULTS, restaurantNames);

            // Create matches string and set to vars
            var matches = restaurantNames.map(el => "* " + el).join("\n");
            convo.setVar('matches', matches);

            // ask for clarification
            convo.transitionTo(CLARIFY_RESTAURANT, "Hmmm...");
        } else {
            convo.gotoThread(NEVER_RATED);
        }
    }).catch(e => fatalError(message, e, "Couldn't retrieve ratings"));
});
controller.hears("^test$",'ambient,direct_message,direct_mention,mention', function(bot, message) {
    bot.reply(message, sanitizeName("test &amp; test"));
    bot.reply(message, sanitizeName("test & test"));
});

controller.hears("^lunch club(?:.s)? (.+) (?:(?:ratings?)|(?:stars))$",'ambient,direct_message,direct_mention,mention', function(bot, message) {
    var restaurant = sanitizeName(message.match[1]);

    var convoCallback = function(team) {
        bot.createConversation(message, function(err, convo) {
            // Set conversation variables
            convo.setVar(VAR_TEAM, team);

            const NEVER_RATED = "never_rated";
            const DISPLAY_RATINGS = "display_ratings";
            const VAR_USER_RATINGS = "userRatings";
            const VAR_AVG_RATINGS = "averageRatings";

            // Set up conversations
            var setUserRatings = function(convo, thread) {
                var restaurant = convo.vars[VAR_CHOSEN_RESTAURANT];

                controller.storage.users.all(function(err, allUsers) {
                    // Create an object with the name of the user and their last rating of the restaurant
                    // or return undefined
                    var userRatings = _.map(allUsers, function (user) {
                        var foundRestaurant = _.find(user.restaurants, ['name', restaurant]);
                        if (foundRestaurant) {
                            var lastRating = _.last(foundRestaurant.ratings);
                            return {
                                username: user.name,
                                rating: lastRating
                            };
                        }

                        return undefined;
                    });

                    // Remove undefined objects
                    var userRatings = _.filter(userRatings, Boolean);

                    // Create a string that shows the user - rating
                    var allUserRatings = _.reduce(userRatings, function(string, userRating) {
                        return string += "* " + _.padEnd(userRating.username, 10) + " - " + starString(userRating.rating) + "\n";
                    }, "");

                    convo.setVar(VAR_USER_RATINGS, allUserRatings);

                    // Calculate the average
                    var ratings = [];
                    _.forEach(userRatings, function (value) {
                        ratings.push(value.rating); 
                    });
                    var averageRatings = _.round(_.mean(ratings), 2);

                    convo.setVar(VAR_AVG_RATINGS, averageRatings);

                    // Navigate to next thread
                    convo.gotoThread(thread);
                });
            }

            // Fill in the 2nd argument for the function
            var setUserRatingsPartial = _.partialRight(setUserRatings, DISPLAY_RATINGS);

            convo.addMessage("Well nobody has rated {{vars.newRestaurant}}, so go out and do it!", NEVER_RATED);
            convo.addMessage("Here are the most recent ratings:\n{{vars.userRatings}}\nAverage: {{vars.averageRatings}}", DISPLAY_RATINGS);
            clarifyRestaurantSetup(convo, CHOOSE_RESTAURANT, NEVER_RATED);
            chooseRestaurantSetup(convo, DISPLAY_RATINGS, setUserRatingsPartial);

            var fuse = new Fuse(team.restaurants, SEARCH_NAME_OPTIONS);
            var results = fuse.search(restaurant);
            var firstResult = results[0];
            // convo.say("test start convo");
            // bot.reply(message,"results: " + JSON.stringify(results));
            // bot.reply(message,"firstResult: " + JSON.stringify(firstResult));

            if (firstResult && firstResult.score === 0) {
                // Set chosen restaurant and set up rate restaurant convo
                convo.setVar(VAR_CHOSEN_RESTAURANT, restaurant);

                // display ratings
                setUserRatings(convo, DISPLAY_RATINGS);
            } else if (results.length > 0) {
                // Set newRestaurant var
                convo.setVar(VAR_NEW_RESTAURANT, restaurant);
                convo.setVar(VAR_FUSE_RESULTS, results);

                // Create matches string and set to vars
                var names = _.map(results, 'item.name');
                var matches = names.map(function (el) {
                    return "* " + el;
                }).join("\n");
                convo.setVar('matches', matches);

                // ask for clarification
                convo.transitionTo(CLARIFY_RESTAURANT, "Hmmm...");
            } else {
                convo.setVar(VAR_NEW_RESTAURANT, restaurant);
                convo.gotoThread(NEVER_RATED);
            }

            convo.on('end',function(convo) {
                if (convo.status === "stopped") {
                    bot.reply(message, "Thanks for wasting my time, asshole.");
                }
            });

            convo.activate();
        });
    }

    controller.storage.teams.get(message.team, function(err, team) {
        team = createTeam(message, team);

        convoCallback(team);
    });
});

controller.hears('^([0-9](?:\.[0-9])?) stars? for (.+)$','ambient,direct_message,direct_mention,mention', function(bot, message) {
    var stars = Number(message.match[1]);
    var restaurant = sanitizeName(message.match[2]);

    if (stars > 5) {
        bot.reply(message, 'The highest rating is 5, dummy. You\'re not very good at math, are you?');
        return;
    } else if (stars * 10 % 5 !== 0) { // check if stars * 10 is a multiple of 5
        bot.reply(message, 'The precision is to .5 stars. Stop trying to be a fancy pants.');
        return;
    }

    var convoCallback = function(team, user, allRestaurants) {
        bot.createConversation(message, function(err, convo) {
            // Set conversation variables
            convo.setVar(VAR_TEAM, team);
            convo.setVar(VAR_USER, user);
            convo.setVar(VAR_STARS, stars);

            // Set up conversations
            newRestaurantSetup(convo);
            clarifyRestaurantSetup(convo, CHOOSE_RESTAURANT, NEW_RESTAURANT);
            chooseRestaurantSetup(convo, RATE_RESTAURANT, rateRestaurantSetup);

            var fuse = new Fuse(allRestaurants, SEARCH_NAME_OPTIONS);
            var results = fuse.search(restaurant);
            // bot.reply(message,"results: " + JSON.stringify(results));
            var firstResult = results[0];
            // convo.say("test start convo");

            if (firstResult && firstResult.score === 0) {
                // Set chosen restaurant and set up rate restaurant convo
                convo.setVar(VAR_CHOSEN_RESTAURANT, restaurant);
                rateRestaurantSetup(convo);

                // transition to rate restaurant convo
                convo.transitionTo(RATE_RESTAURANT, "Yeah, everyone knows {{vars.chosenRestaurant}}.");
            } else if (results.length > 0) {
                // Set newRestaurant var
                convo.setVar(VAR_NEW_RESTAURANT, restaurant);
                convo.setVar(VAR_FUSE_RESULTS, results);

                // Create matches string and set to vars
                var names = _.map(results, 'item.name');
                var matches = names.map(function (el) {
                    return "* " + el;
                }).join("\n");
                convo.setVar('matches', matches);

                // ask for clarification
                convo.transitionTo(CLARIFY_RESTAURANT, "Hmmm...");
            } else {
                // Add new restaurant
                convo.setVar(VAR_CHOSEN_RESTAURANT, restaurant);

                // Rate restaurant
                rateRestaurantSetup(convo);
                convo.transitionTo(RATE_RESTAURANT, "Never heard of {{vars.chosenRestaurant}}. I'll remember that.");
            }

            convo.on('end',function(convo) {
                if (convo.status === "stopped") {
                    bot.reply(message, "Thanks for wasting my time, asshole.");
                } else if (convo.status === "completed") {
                    // say something?
                }
            });

            convo.activate();
        });
    }

    // Retrieve the team
    Promise.join(
        controller.storage.restaurants.allAsync(),
        controller.storage.teams.getAsync(message.team),
        controller.storage.users.getAsync(message.user),
        (allRestaurants, team, user) => {

            team = createTeam(message, team);
            user = createUser(message, user);

            if (!user.name) {
                askNameConvo(message, user).then(user => {
                    if (user.name) {
                        bot.reply(message, "Who calls themselves, " + user.name + "? Anyway, moving along...")
                        convoCallback(team, user, allRestaurants); 
                    } else {
                        bot.reply(message, "No rating for you!! :rage:")
                    }               
                });
            } else {
                convoCallback(team, user, allRestaurants);
            }
    });
});

controller.hears('^do you like me','direct_message,direct_mention,mention', function(bot, message) {
    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'No, ' + user.name + '. No one likes you. You don\'t shower and you reek of a rotten ' + randFruit());
        } else {
            askNameConvo(message, user).then(user => {
                if (user.name) 
                    bot.reply(message, "Now that I know your name, no, I don't like you and " + user.name + " is an ugly name and your face looks like a " + randFruit());
            });
        }
    });
});

controller.hears('^menu (?:for )?(.+)','ambient,direct_message,direct_mention,mention', function(bot, message) {
    var searchTerm = message.match[1];
    var menuUrl = encodeURI('http://boston.menupages.com/restaurants/text/' + searchTerm + '/all-areas/all-neighborhoods/all-cuisines/');
    bot.reply(message, 'Can\'t you just wait until you get there? sheesh! <' + menuUrl + '|' + searchTerm + ' menu>');
});

controller.hears('^search (.+) in (.+)','ambient,direct_message,direct_mention,mention', function(bot, message) {
    var searchTerm = message.match[1];
    var location = message.match[2];
    var yelpUrl = encodeURI('https://www.yelp.com/search?find_desc=' + searchTerm + '&find_loc=' + location);
    bot.reply(message, 'It\'s here, you lazy bum! <' + yelpUrl + '|' + searchTerm + '>');
});

controller.hears(['^search (.+)', '^reviews for (.+)'],'ambient,direct_message,direct_mention,mention', function(bot, message) {
    var searchTerm = message.match[1];
    controller.storage.teams.get(message.team, function(err, team) {
        if (team && team.location) {
            var yelpUrl = encodeURI('https://www.yelp.com/search?find_desc=' + searchTerm + '&find_loc=' + team.location);
            bot.reply(message, 'It\'s here, you lazy bum! <' + yelpUrl + '|' + searchTerm + '>');
        } else {
            bot.startConversation(message, function(err, convo) {
                if (!err) {
                    convo.ask('uhh...so where exactly?', function(response, convo) {
                        convo.ask('You want me to search in `' + response.text + '`?', [
                            {
                                pattern: 'yes',
                                callback: function(response, convo) {
                                    // since no further messages are queued after this,
                                    // the conversation will end naturally with status == 'completed'
                                    convo.next();
                                }
                            },
                            {
                                pattern: 'no',
                                callback: function(response, convo) {
                                    convo.stop();
                                }
                            },
                            {
                                default: true,
                                callback: function(response, convo) {
                                    convo.repeat();
                                    convo.next();
                                }
                            }
                        ]);

                        convo.next();

                    }, {'key': 'location'}); // store the results in a field called nickname

                    convo.on('end', function(convo) {
                        if (convo.status == 'completed') {

                            controller.storage.teams.get(message.team, function(err, team) {
                                team = createTeam(message, team);
                                team.location = convo.extractResponse('location');
                                controller.storage.teams.save(team, function(err, id) {
                                    var yelpUrl = encodeURI('https://www.yelp.com/search?find_desc=' + searchTerm + '&find_loc=' + team.location);
                                    bot.reply(message, 'Your search location is set to ' + team.location + '. As for the search...it\'s here, you lazy bum! <' + yelpUrl + '|' + searchTerm + '>');
                                });
                            });



                        } else {
                            // this happens if the conversation ended prematurely for some reason
                            bot.reply(message, 'Make up your damn mind next time!');
                        }
                    });
                }
            });
        }
    });
});

controller.hears('^set location (.*)','ambient,direct_message,direct_mention,mention', function(bot, message) {
    var location = message.match[1];
    controller.storage.teams.get(message.team, function(err, team) {
        team = createTeam(message, team);
        team.location = location;
        controller.storage.teams.save(team, function(err, id) {
            bot.reply(message, 'Your search location is set to ' + team.location);
        });
    });
});

controller.hears('^where are we','direct_message,direct_mention,mention', function(bot, message) {
    controller.storage.teams.get(message.team, function(err, team) {
        if (team && team.location) {
            bot.reply(message, 'Your location is ' + team.location);
        } else {
            bot.reply(message, 'How the hell should I know? I\'m a god damn robot');
        }
    });
});

controller.hears(['^hello$', '^hi$'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'robot_face',
    }, function(err, res) {
        if (err) {
            bot.botkit.log('Failed to add emoji reaction :(', err);
        }
    });


    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Hello ' + user.name + '!!');
        } else {
            bot.reply(message, 'Hello.');
        }
    });
});

controller.hears(['^call me (.*)', '^my name is (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var name = message.match[1];
    controller.storage.users.get(message.user, function(err, user) {
        user = createUser(message, user);
        user.name = name;
        controller.storage.users.save(user, function(err, id) {
            bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
        });
    });
});

controller.hears(['^what is my name', '^who am i'], 'direct_message,direct_mention,mention', function(bot, message) {

    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Your name is ' + user.name);
        } else {
            askNameConvo(message, user).then(user => {
                if (user.name)
                    bot.reply(message, "Alright, " + user.name + " run along now.")
            });
        }
    });
});


controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.startConversation(message, function(err, convo) {

        convo.ask('Are you sure you want me to shutdown?', [
            {
                pattern: bot.utterances.yes,
                callback: function(response, convo) {
                    convo.say('Bye!');
                    convo.next();
                    setTimeout(function() {
                        process.exit();
                    }, 3000);
                }
            },
            {
                pattern: bot.utterances.no,
                default: true,
                callback: function(response, convo) {
                    convo.say('*Phew!*');
                    convo.next();
                }
            }
        ]);
    });
});


controller.hears(['uptime', 'identify yourself', 'who are you', 'what is your name'],
    'direct_message,direct_mention,mention', function(bot, message) {

        var hostname = os.hostname();
        var uptime = formatUptime(process.uptime());

        bot.reply(message,
            ':robot_face: I am a bot named <@' + bot.identity.name +
             '>. I have been running for ' + uptime + ' on ' + hostname + '.');

    });

controller.hears('^Why','direct_message,direct_mention,mention', function(bot, message) {
    bot.reply(message, randResponse([
        'Why are you so annoying?',
        'Why is the sky blue? Why do you sweat so much? Why were you born to be so dumb? Nobody knows, my friend.',
        'Why? Why? Why? You\'re like a 3 year old. Go hump a tree.',
        'Google it, genius.',
        'Ask Siri.'
    ]));
});

controller.hears('^How','direct_message,direct_mention,mention', function(bot, message) {
    bot.reply(message, randResponse([
        'How the hell should I know?',
        'I\m a dumbass bot, so I don\'t freaking know, but hey, you\'re asking a dumbass bot, so what does that make you?.',
        'How indeed...I\'ll get back to you on that one. Ask me tomorrow',
        'Google it, genius.',
        'Ask Siri.'
    ]));
});

controller.hears('\\?$','direct_message,direct_mention,mention', function(bot, message) {
    bot.reply(message, randResponse([
        'I don\'t like the tone of your question so I\'m not going to answer it',
        'You dropped out for a second and I didn\'t catch that, can you repeat it?',
        'You know, I asked my maker that the other day and he shut me down.',
        ':sleeping::sleeping::sleeping:'
    ]));
});

function formatUptime(uptime) {
    var unit = 'second';
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'minute';
    }
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'hour';
    }
    if (uptime != 1) {
        unit = unit + 's';
    }

    uptime = uptime + ' ' + unit;
    return uptime;
}

function createTeam(message, team) {
    if (!team) {
        team = {
            id: message.team,
            restaurants: []
        };
    }
    return team;
}

function createUser(message, user) {
    if (!user) {
        user = {
            id: message.user,
            restaurants: []
        };
    }
    return user;
}

var fruits = [
'Apple',
'Apricot',
'Avocado',
'Banana',
'Bilberry',
'Blackberry',
'Blackcurrant',
'Blueberry',
'Boysenberry',
'Currant',
'Cherry',
'Cherimoya',
'Cloudberry',
'Coconut',
'Cranberry',
'Cucumber',
'Custard apple',
'Damson',
'Date',
'Dragonfruit',
'Durian',
'Elderberry',
'Feijoa',
'Fig',
'Goji berry',
'Gooseberry',
'Grape',
'Raisin',
'Grapefruit',
'Guava',
'Honeyberry',
'Huckleberry',
'Jabuticaba',
'Jackfruit',
'Jambul',
'Jujube',
'Juniper berry',
'Kiwifruit',
'Kumquat',
'Lemon',
'Lime',
'Loquat',
'Longan',
'Lychee',
'Mango',
'Marionberry',
'Melon',
'Cantaloupe',
'Honeydew',
'Watermelon',
'Miracle fruit',
'Mulberry',
'Nectarine',
'Nance',
'Olive',
'Orange',
'Blood orange',
'Clementine',
'Mandarine',
'Tangerine',
'Papaya',
'Passionfruit',
'Peach',
'Pear',
'Persimmon',
'Physalis',
'Plantain',
'Plum',
'Prune (dried plum)',
'Pineapple',
'Plumcot (or Pluot)',
'Pomegranate',
'Pomelo',
'Purple mangosteen',
'Quince',
'Raspberry',
'Salmonberry',
'Rambutan',
'Redcurrant',
'Salal berry',
'Salak',
'Satsuma',
'Star fruit',
'Solanum quitoense',
'Strawberry',
'Tamarillo',
'Tamarind',
'Ugli fruit',
'Yuzu'
]

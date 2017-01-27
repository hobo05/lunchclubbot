# Lunchclubbot

Originally forked from <https://github.com/howdyai/botkit>

Used the [botkit framework](https://github.com/howdyai/botkit) to create a [Slack](https://slack.com/) chat bot that can do what a Yelp chatbot like the Slack [Lunchbot](https://slack.com/apps/A1605411B-lunchbot) and also store your own ratings for a restaurant.

## Commands

* help
* hello
* (stars) for (place)
* my (place) rating
* lunch club (place) ratings
* search (place) in (location)
* search (place)
* reviews for (place)
* menu for (place)
* set location (location)
* where are we
* call me (name)
* my name is (name)
* who am i
* what is my name
* who are you
* do you like me
* tell (person) (something)

## Tech Stack
* [node](https://nodejs.org)
* [npm](https://www.npmjs.com/)
* [Botkit](https://howdy.ai/botkit/) - Toolkit for creating bots
* [Blue Bird](http://bluebirdjs.com/) - Feature-rich Promise library
* [MongoDB](https://www.mongodb.com/) - Popular NoSQL DB
* [mongoose](http://mongoosejs.com/) - MongoDB ORM
* [Fuse.js](http://fusejs.io/) - Lightweight fuzzy-search library
* [Lodash](https://lodash.com/) - JS Utility library

## How to Run

### Local Setup

1. Sign up for <http://www.slack.com> and create a team if you don't have admin rights in your current one
* Create a custom integration bot by going here <https://slack.com/apps/build>
* Note down the API token
* Set up an instance of <https://www.mongodb.com> or create a free instance using <https://mlab.com/> (MongoDB as a service)
* Create a user and make sure you can connect through the mongo shell
* Create a `.env` file in the project root folder
* Add the necessary environment variables to the file. See here for more details  <https://www.npmjs.com/package/dotenv> and see below for an example
* Run `npm start`
* Chat with your bot!

### Heroku Setup

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

1. After performing the local setup and seeing that everything works, sign up for Heroku on the free plan with the button above
* Follow the tutorial for [Getting Started on Heroku with Node.js](https://devcenter.heroku.com/articles/getting-started-with-nodejs) if you don't know how Heroku works
* Create a new Heroku app from your project root
* Install <https://github.com/xavdid/heroku-config> and push your .env settings to heroku
* Run `heroku scale web=0 worker=1` to make sure the chatbot isn't required to bind to the provided Heroku port, otherwise Heroku will shut the app down thinking the app is not responsive since it didn't bind to the port.
* Push your app to the Heroku repo and tail the logs
* Chat with your cloud-enabled bot!

**Sample .env file**

```bash
SLACK_TOKEN=abctoken
MONGODB_URL=mongodb://testuser:password@test.com/testdb
```

## TODO
* Remove extra files cloned from <https://github.com/howdyai/botkit>
* Refactor code to use Promises for everything async
* Command for top 10 rated restaurants (by team average and by user)
* Restaurant wishlist
# Lunchclubbot

Originally forked from <https://github.com/howdyai/botkit>

Used the [botkit framework](https://github.com/howdyai/botkit) to create a [Slack](https://slack.com/) chat bot that can do what a Yelp chatbot like the Slack [Lunchbot](https://naaaaaaps.slack.com/apps/A1605411B-lunchbot) and also store your own ratings for a restaurant.

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

## How to Run

```bash
# $SLACK_TOKEN is your token for your slack chat bot
token=$SLACK_TOKEN node slack_bot.js
```
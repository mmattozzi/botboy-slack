const { App } = require('@slack/bolt');
const Persistence = require('./persistence/persistence');
const fs = require('fs');
const request = require('request');

// Initializes your app with your bot token and signing secret
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

try {
	var properties = JSON.parse(fs.readFileSync("bot.properties"));
} catch (err) {
	console.log("Missing or corrupt bot.properties file in base directory?");
	throw err;
}

var macesReviews = fs.readFileSync("maces-reviews.txt", 'utf8').split('\n');
if (macesReviews[macesReviews.length - 1] === '') {
  macesReviews.pop();
}

var persistence = new Persistence(properties);
var userIdMap = { };

// Return all pattern matches with captured groups
RegExp.prototype.execAll = function(string) {
    var match = null;
    var matches = new Array();
    while (match = this.exec(string)) {
        var matchArray = [];
        for (i in match) {
            if (parseInt(i) == i) {
                matchArray.push(match[i]);
            }
        }
        matches.push(matchArray);
    }
    return matches;
}

function formatResponse(context, message) {
    var resp = {
        blocks: [
          {
            type: "context",
            elements: [
              {
                type: "plain_text",
                text: context
              }
            ]
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: message
            }
          }
        ]
      };
      
  return resp;
}

async function resolveDisplayName(userId, client) {
  var displayName = "unknown";
  if (userIdMap[userId]) {
    displayName = userIdMap[userId];
    console.log("Found display name in cache");
  } else {
    const result = await client.users.info({
      user: userId
    });
    
    if (result.user.is_bot) {
      displayName = result.user.profile.real_name;
    } else {
      displayName = result.user.profile.display_name;
    }
    userIdMap[userId] = displayName;
    console.log("Looked up display name for " + userId, " found: " + displayName);
  }
  return displayName;
}

async function messageContext(parentTs, client, channel) {
  var result = await client.conversations.replies({
    channel: channel,
    ts: parentTs
  });
  
  if (result.messages.length > 0) {
    if (result.messages[0].bot_profile && result.messages[0].bot_profile.name == properties.bot.nick) { 
      if (result.messages[0].blocks && result.messages[0].blocks.length > 0 && 
        result.messages[0].blocks[0].elements && result.messages[0].blocks[0].elements.length > 0) {
        
        var botText = result.messages[0].blocks[0].elements[0].text;
        // that's the message that was sent -- pick out the message ID
        console.log("Replying to " + botText);
        var match = botText.match(/\((\d+)\)/);
        if (match) {
          return { messageId: match[1], text: null };
        }
      } else if (result.messages[0].text) {
        return { messageText: result.messages[0].text };
      }
    }
  }
  
  return null;
}

// Listens to incoming messages
app.message(/.*/, async ({ message, client, say }) => {
  // say() sends a message to the channel where the event was triggered
  //await say(`Hey there <@${message.user}>!`);
  
  console.log(JSON.stringify(message));
  
  var displayName = await resolveDisplayName(message.user, client);
  
  console.log("Message from: " + displayName);
  
  var translatedMessage = message.text;  
  var userIdsToTranslate = /<@(.*?)>/g.execAll(message.text);
  
  for (var i = 0; i < userIdsToTranslate.length; i++) {
    var mentionedUserId = userIdsToTranslate[i];
    var mentionedDisplayName = await resolveDisplayName(mentionedUserId[1], client);
    translatedMessage = translatedMessage.replace(mentionedUserId[0], mentionedDisplayName);
  }
  
  console.log("Translated message: " + translatedMessage);
  
  // This message is a reply in a thread, maybe it is asking for clarification on a quote
  if (message.thread_ts && message.thread_ts != message.ts) {
    console.log("Checking thread");
    if (message.text == "context") {
      var resultContext = await messageContext(message.thread_ts, client, message.channel);
      if (resultContext != null) {
        console.log("Finding context of message ID: " + JSON.stringify(resultContext));
        persistence.getContext(resultContext, say, message.thread_ts);
      }
    }
  }

  if (! properties.logger.ignoreNicks.filter(function (x) { return displayName.indexOf(x) > -1; }).length > 0) {
      if (! (/^!/).test(message.text)) {
        persistence.saveMessage(displayName, translatedMessage);
      }
  }

  var re = new RegExp(properties.bot.nick);
  if (re.test(translatedMessage)) {
    persistence.getRandom(say);
    return;
  }
  
});

app.command('/do', async ({ command, ack, client, say }) => {
  // Acknowledge command request
  await ack();
  var userDisplayName = await resolveDisplayName(command.user_id, client);
  persistence.getQuote(command.text, userDisplayName, say);
});

app.command('/find', async ({ command, ack, client, say }) => {
  // Acknowledge command request
  await ack();
  var userDisplayName = await resolveDisplayName(command.user_id, client);
  persistence.findMatchingMessage(command.text, userDisplayName, say);
});

app.command('/showerthought', async ({command, ack, client, say}) => {
  await ack();
  request("http://www.reddit.com/r/showerthoughts/.json", async function (error, response, body) {
    if (!error && response.statusCode == 200) {
        //console.log(body) // Print the results
        var showerthought = JSON.parse(body);
        // There are many returned in the json.  Get a count
        var showercount = showerthought.data.children.length
        var randomthought = Math.floor((Math.random() * showercount) + 1);
        console.log("Found " + showercount + " shower thoughts.  Randomly returning number " + randomthought);
        var userDisplayName = await resolveDisplayName(command.user_id, client);
        say(formatResponse("Shower thought request by " + userDisplayName, showerthought.data.children[randomthought].data.title));
      }
    });
});

app.command('/define', async ({command, ack, client, say}) => {
  await ack();
  var userDisplayName = await resolveDisplayName(command.user_id, client);
  
  request("http://api.urbandictionary.com/v0/define?term=" + command.text, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var urbanresult = JSON.parse(body);
      say(formatResponse("Definition of " + command.text + " requested by " + userDisplayName, urbanresult.list[0].definition));
    }
  });
});

app.command('/maces', async ({command, ack, client, say}) => {
  await ack();
  var userDisplayName = await resolveDisplayName(command.user_id, client);
  say(formatResponse("Maces review requested by " + userDisplayName, macesReviews[Math.floor(Math.random()*macesReviews.length)]));
});

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');
})();
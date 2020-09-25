const { App } = require('@slack/bolt');
const Persistence = require('./persistence/persistence');
const fs = require('fs');

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

app.command('/do', async ({ command, ack, say }) => {
  // Acknowledge command request
  await ack();
  persistence.getQuote(command.text, say);
});

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');
})();
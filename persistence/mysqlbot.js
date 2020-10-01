var MySQLClient = require('./MysqlWrapper');

function MysqlBot() {
    
    this.mysql = null;
    this.respond = true;
    var self = this;
    
    this.formatResponse = function(context, message) {
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
    
    this.init = function(properties, respond) {
        this.mysql = new MySQLClient(properties.mysql);
        this.mysql.connect();
        console.log("Using mysql for persistence");
        this.respond = respond;
        
        return this;
    };
    
    this.saveMessage = function(nick, message) {
        if (this.mysql) {
            this.mysql.query("INSERT INTO messages (nick, message) VALUES (?, ?)", [nick, message], function() { });
        }
    };
    
    this.getRandom = function(say) {
        if (this.mysql && this.respond) {
            this.mysql.query("select * from messages where length(message) > 20 order by rand() limit 1", function(results, fields) {
                if (results.length > 0) {
                    say(results[0].message);
                }
            });
        }
    };
    
    this.getQuote = function(nick, requestor, say) {
        if (this.mysql && this.respond) {
            this.mysql.query("select * from messages where length(message) > 15 and nick like '" + nick + "' order by rand() limit 1", function(results, fields) {
                if (results.length > 0) {
                  say(self.formatResponse("/do " + nick + " requested by " + requestor + 
                  " - Result from " + results[0].date.toDateString() + " ID: (" + results[0].id + ")", results[0].message));
                }
            });
        }
    };
    
    this.getContext = function(msgId, say, thread_ts) {
        if (this.mysql && this.respond) {
            this.mysql.query("select * from messages where id > " + (parseInt(msgId) - 5) + " and id < " + (parseInt(msgId) + 5), function(results, fields) {
                if (results.length > 0) {
                    // bot.say('#' + results[0].id + " " + results[0].nick + ": " + results[0].message);
                    
                    var resp = { blocks: [], thread_ts: thread_ts };
                    
                    for (var i = 0; i < results.length; i++) {
                      resp.blocks.push({
                        type: "section",
                        text: {
                          type: "mrkdwn",
                          text: (results[i].id == msgId ? "*" : "") + results[i].nick + ": " + results[i].message + (results[i].id == msgId ? "*" : "")
                        }
                      });
                    }
                    
                    say(resp);
                }
            });
        }
    };
    
    this.getMessage = function(msgId, bot) {
        if (this.mysql && this.respond) {
            this.mysql.query("select * from messages where id = " + msgId, function(results, fields) {
                if (results.length > 0) {
                    bot.say('#' + results[0].id + " " + results[0].nick + ": " + results[0].message);
                }
            });
        }
    };
    
    this.matchMessage = function(str, bot) {
        if (this.mysql && this.respond) {
            var mysql_ = this.mysql;
            this.mysql.query("select * from messages where message regexp '" + str + "' order by rand() limit 1", function(results, fields) {
                if (results.length > 0) {
                    var randResults = results;
                    mysql_.query("select count(*) cnt from messages where message regexp '" + str + "'", function(results, fields) {
                        bot.say('#' + randResults[0].id + " " + randResults[0].message + " [" + results[0].cnt + " match]");
                    });
                }
            });
        }
    };
    
    this.matchMessageForNick = function(nick, str, bot) {
        if (this.mysql && this.respond) {
            this.mysql.query("select * from messages where nick like '" + nick + "' and message regexp '" + str + "' order by rand() limit 1", function(results, fields) {
                if (results.length > 0) {
                    bot.say('#' + results[0].id + " " + results[0].message);
                }
            });
        }
    };
    
    this.leaders = function(index, bot) {
        if (this.mysql && this.respond) {
            if (! index) {
                index = 0;
            }
            this.mysql.query("select nick, count(*) cnt from messages group by nick order by count(*) desc limit " + index + ",10", function(results, fields) {
                if (results.length > 0) {
                    var response = "";
                    results.forEach(function(row) {
                        response += row.nick + ": " + row.cnt + ", ";
                    });
                    response = response.slice(0, -2);
                    bot.say(response);
                }
            });
        }
    };
    
    this.userStats = function(nick, bot) {
        if (this.mysql && this.respond) {
            this.mysql.query("select avg(words) as avgwords, count(*) as total from (select nick, (length(message) - length(replace(message, ' ', '')) + 1) as words from messages) as wordcount where nick = ?", [nick], function(results, fields) {
                if (results.length > 0 && results[0].total > 0) {
                    bot.say('Total messages: ' + results[0].total + ', Average length: ' + results[0].avgwords + ' words');
                }
            });
        }
    };
}

module.exports = MysqlBot;

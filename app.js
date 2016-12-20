var express = require('express')
var app = express()
var server = require('http').createServer(app)
var io = require('socket.io')(server)
var axios = require('axios')
var cheerio = require('cheerio')
var rp = require('request-promise')

var firebase = require('firebase')
var admin = require("firebase-admin");
admin.initializeApp({
    credential: admin.credential.cert({
    }),
    databaseURL: "https://scoretracker-9a7e5.firebaseio.com/"
});

// Initialize Firebase
var config = {
};
firebase.initializeApp(config);
var database = firebase.database()
var auth = firebase.auth()

var fs = require("fs")
var path = require("path")
var args = require("minimist")(process.argv.slice(2))
const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || '127.0.0.1'
const POLLING_INTERVAL = 60000 //ms

// Serve index.html
app.use(function(req, res, next) {
	const fpath = path.join(__dirname + '/public', req.path)
	fs.stat(fpath, function(err, info){
		if (err || info.isDirectory()){
			res.sendFile(path.join(__dirname + '/public', "index.html"))
		} else {
			res.sendFile(fpath)
		}
	})
})

io.on("connection", function(socket){
    socket.on("sign_in", function(data){
        var idToken = data.user
        var user = verifyUser(idToken).then(function(user){
            console.log(user.displayName + " has signed in")
            // Fetch user's playerlist
            database.ref("/users/"+user.uid+"/playerlist").once('value').then(function(snapshot){
                var playerlist = snapshot.val()
                // Loop through all players 
                Object.keys(playerlist).forEach(function(player) {
                    var player = playerlist[player] // Individual player
                    console.log(player)
                    var players = database.ref('players/'+player.battleNet);
                    // Listen for changes for each player in user's playerlist
                    players.on('value', function(snapshot) {
                        // Something changed, emit new data
                        socket.emit("playerdata", {player: snapshot.val(), battleNet: player.battleNet})
                    });
                })
            })
        }).catch(function(error){
        })
    })
    socket.on("delete_player_from_playerlist", function(data){
        var idToken = data.tkn
        var user = verifyUser(idToken).then(function(user){
            deletePlayerFromPlayerlist(user.uid, data.battleNet)
            .then(function(response){
                socket.emit("message", {message: response})
            })
        })
    })
    socket.on("add_player", function(data){
        var idToken = data.tkn
        var battleNet = data.battleNet
        var user = verifyUser(idToken).then(function(user){
            if (!battleNet){
                socket.emit("message", {message: "Player does not have a competitive rank yet"})
            }
            console.log(user.displayName + " is adding battleNet: " + battleNet)

            var getPlayer = {
                battleNet: battleNet,
                region: "eu"
            }

            getPlayerData(getPlayer)
            .then(function(player_current){ 
                // Check if player is already in Firebase
                database.ref("/players/"+battleNet).once('value').then(function(snapshot){
                    var snapshot = snapshot.val()
                    // Player not already in database, can add
                    // This way no overwriting will occur
                    if (snapshot === null){
                        console.log(player_current)
                        // Add player to database
                        database.ref("players/" + getPlayer.battleNet).set({
                            avatar: player_current.avatar,
                            playerName: player_current.username,
                        }).then(function(){
                            var timestamp = Math.floor(Date.now() / 1000)
                            pushNewRank(battleNet, player_current.rank, player_current.rank_img, timestamp)

                            // Add player reference to user's playerlist
                            addPlayerlistEntry(getPlayer.battleNet, user)

                            socket.emit("message", {message: "Player has been added"})
                        })
                    } 
                    // Player already in database, only add playerlist entry for user
                    else {
                        addPlayerlistEntry(battleNet, user)
                    }
                })
            }).catch(function(error){
                socket.emit("message", {message: error})
            })
        })
    })
    function addPlayerlistEntry(battleNet, user){
        // Check if player already has an entry
        database.ref("/users/"+user.uid+"/playerlist").once('value').then(function(snapshot){
            var playerlist = snapshot.val()
            
            if (playerlist !== null && playerlistHasBattleNet(playerlist, battleNet)){
                console.log("Already had battleNet, returning")
                socket.emit("message", {message: "Player has been already added"})
            } else {
                console.log("Didn't have battleNet, adding entry")
                var newPlayerlistEntryRef = database.ref("/users/"+user.uid+"/playerlist").push();
                newPlayerlistEntryRef.set({
                    battleNet: battleNet,
                }).then(function(){
                    console.log("Done adding entry to playerlist")
                    database.ref("/players/"+battleNet).once('value').then(function(snapshot){
                        socket.emit("playerdata", {player: snapshot.val(), battleNet: battleNet})
                    })
                })
            }
        })
    }
})
function playerlistHasBattleNet(playerlist, battleNet){
    var has;
    if (!playerlist){
        has = false
    }
    Object.keys(playerlist).forEach(function(key){
        if (playerlist[key].battleNet == battleNet){
            has = true
        }
    })
    return has
}

// Updates database with new data
database.ref("/players/").once('value').then(function(snapshot){
    var players = snapshot.val()
    setInterval(function(){
        // Loop through all players in database
        Object.keys(players).forEach(function(player) {
            var getPlayer = {
                battleNet: player,
                region: "eu"
            }
            // Get current player data
            getPlayerData(getPlayer).then(function(player_current){
                var timestamp = Math.floor(Date.now() / 1000)
                var newRank = player_current.rank
                
                // Get (perhaps outdated) player info from database
                database.ref("/players/"+player).once('value').then(function(snapshot){
                    var player_db = snapshot.val()
                    var newestRankEntry = null
                    if (player_db.ranks){
                        newestRankEntry = player_db.ranks[Object.keys(player_db.ranks)[Object.keys(player_db.ranks).length-1]]
                    }
                    // Only update if new data and current database data are different
                    if (!newestRankEntry || newestRankEntry.rank != newRank && newestRankEntry.timestamp != timestamp){
                        pushNewRank(player, newRank, player_current.rank_img, timestamp)
                    }

                    // Update avatar and maybe other info (if has changed)
                    if (player_current.avatar != player_db.avatar){
                        var updatedInfo = {
                            avatar: player_current.avatar
                        }
                        database.ref("players/"+player).update(updatedInfo)
                    }
                })
            })
        })
    }, POLLING_INTERVAL)
})
// Pushes a new rank for specified player
function pushNewRank(player, newRank, newRankImg, timestamp){
    var newRankRef = database.ref("/players/"+player+"/ranks").push();
    newRankRef.set({
        rank: newRank,
        rank_img: newRankImg,
        timestamp: timestamp
    });   
}

function getPlayerData(player){
    var playerData = {
        avatar: "",
        rank: "",
        rank_img: "",
        username: "",
    }
    return new Promise(function(resolve, reject){
        rp("https://playoverwatch.com/en-us/career/pc/"+player.region+"/"+player.battleNet)
        .then(function(htmlString){
            const $ = cheerio.load(htmlString)
            playerData.avatar   = $('.player-portrait').attr("src")
            playerData.rank     = $('.competitive-rank div').html()
            playerData.rank_img = $('.competitive-rank img').attr('src')
            playerData.username = $('.header-masthead').text()

            if (!playerData.rank || !playerData.rank_img){
                reject("Player does not seem to have a competitive rank yet")
                return
            }

            resolve(playerData)
        }).catch(function(error){
            reject("Player was not found")
        })
    })
}

function deletePlayerFromPlayerlist(uid, battleNet){
    return new Promise(function(resolve, reject){
        var getPlayerRef = database.ref("/users/"+uid+"/playerlist").orderByChild("battleNet").equalTo(battleNet)
        getPlayerRef.once('value').then(function(snapshot){
            var playerToDeleteKey = Object.keys(snapshot.val())[0]
            database.ref("/users/"+uid+"/playerlist/"+playerToDeleteKey).remove()
            .then(function(){
                resolve("Player has been deleted")
            }).catch(function(error){
                reject("Player was not found")
            })
        }).catch(function(error){
            reject("Player was not found")
        })  
    })
}

function verifyUser(idToken){
    return new Promise(function(resolve, reject){
        admin.auth().verifyIdToken(idToken)
        .then(function(decodedToken){
            var uid = decodedToken.uid
            // Get user that matches the decoded token
            admin.auth().getUser(uid)
            .then(function(userRecord){
                var authenticatedUser = userRecord.toJSON()
                resolve(authenticatedUser)
            }).catch(function(error){
                reject("Can't find user")
            })
        }).catch(function(error){
            reject("Can't verify user")
        })  
    })
}

server.listen(PORT, function () {
  console.log("Up and running at port :: " + PORT)
});
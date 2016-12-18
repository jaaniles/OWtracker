var express = require('express')
var app = express()
var server = require('http').createServer(app)
var io = require('socket.io')(server)
var axios = require('axios')
var firebase = require('firebase')
var admin = require("firebase-admin");
admin.initializeApp({
    credential: admin.credential.cert({})
});

// Initialize Firebase
var config = {

};
firebase.initializeApp(config);
var database = firebase.database()
var auth = firebase.auth()

var dbChangeListeners = []

var fs = require("fs")
var path = require("path")

var args = require("minimist")(process.argv.slice(2))

const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || '127.0.0.1'
const POLLING_INTERVAL = 30000 //ms

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
                        socket.emit("playerdata", {player: snapshot.val()})
                    });
                })
            })
        }).catch(function(error){
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
            axios.get("https://api.lootbox.eu/pc/eu/"+battleNet+"/profile")
            .then(function(response){
                // Player not found
                if (response.data.statusCode == 404){
                    console.log(response.data.error)
                    socket.emit("message", {message: response.data.error})
                    return
                } 
                // Player found
                var player = response.data.data
                
                // Check if player is already in Firebase
                database.ref("/players/"+battleNet).once('value').then(function(snapshot){
                    var snapshot = snapshot.val()
                    // Player not already in database, can add
                    // This way no overwriting will occur
                    if (snapshot === null){
                        console.log(player)
                        if (player.competitive.rank === null){
                            socket.emit("message", {message: "Player does not have a competitive rank yet"})
                            return;
                        }

                        // Add player to database
                        database.ref("players/" + battleNet).set({
                            avatar: player.avatar,
                            playerName: player.username,
                            ranks: {
                                "xxxxxx": {
                                    rank: player.competitive.rank,
                                    rank_img: player.competitive.rank_img,
                                    timestamp: Math.floor(Date.now() / 1000)
                                }
                            }
                        }).then(function(){
                            console.log("Player added!")
                            socket.emit("message", {message: "Player has been added"})
                            // Add player reference to user's playerlist
                            addPlayerlistEntry(battleNet, user)
                        })
                    } 
                    // Player already in database, only add playerlist entry for user
                    else {
                        addPlayerlistEntry(battleNet, user)
                    }
                })
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
                        socket.emit("playerdata", {player: snapshot.val()})
                    })
                })
            }
        })
    }
})
function verifyUser(idToken){
    return new Promise(function(resolve, reject){
        console.log("Verifying user..")
        admin.auth().verifyIdToken(idToken)
        .then(function(decodedToken){
            var uid = decodedToken.uid
            console.log("User token has been decoded..")
            // Get user that matches the decoded token
            admin.auth().getUser(uid)
            .then(function(userRecord){
                console.log("Authentication successful..")
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

// Updates database with new data from OW Unofficial Api
database.ref("/players/").once('value').then(function(snapshot){
    var players = snapshot.val()
    setInterval(function(){
        // Loop through all players
        Object.keys(players).forEach(function(player) {
            // Get data for that player from API
            axios.get("https://api.lootbox.eu/pc/eu/"+player+"/profile")
            .then(function(response){
                var player_current = response.data.data
                var timestamp = Math.floor(Date.now() / 1000)
                var newRank = player_current.competitive.rank
                
                // Get (perhaps outdated) player info from database
                database.ref("/players/"+player).once('value').then(function(snapshot){
                    var player_db = snapshot.val()
                    var newestRankEntry = player_db.ranks[Object.keys(player_db.ranks)[Object.keys(player_db.ranks).length-1]]

                    // Only update if new data and current database data are different
                    if (newestRankEntry.rank != newRank && newestRankEntry.timestamp != timestamp){
                        var newRankRef = database.ref("/players/"+player+"/ranks").push();
                        newRankRef.set({
                            rank_img: player_current.competitive.rank_img,
                            rank: newRank,
                            timestamp: timestamp
                        });
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

server.listen(PORT, function () {
  console.log("Up and running at port :: " + PORT)
});
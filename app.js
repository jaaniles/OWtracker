// app.js
var express = require('express')
var app = express()
var server = require('http').createServer(app)
var io = require('socket.io')(server)
var axios = require('axios')
var firebase = require('firebase')
var admin = require("firebase-admin");
admin.initializeApp({
    credential: admin.credential.cert({
        projectId: "",
        clientEmail: "",
        privateKey: ""
    }),
    databaseURL: "https://scoretracker-9a7e5.firebaseio.com/"
});

// Initialize Firebase
var config = {
    apiKey: "",
    authDomain: "scoretracker-9a7e5.firebaseapp.com",
    databaseURL: "https://scoretracker-9a7e5.firebaseio.com",
    storageBucket: "scoretracker-9a7e5.appspot.com",
    messagingSenderId: "783389239694"
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
const POLLING_INTERVAL = 10000 //ms

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

var dbPlayers
io.on("connection", function(socket){
    // Creates change listeners for each player in our database
    /*
    database.ref("/players/").once('value').then(function(snapshot){
        return;
        var players = snapshot.val()
        // Loop through all players
        Object.keys(players).forEach(function(player) {
             var player = players[player] // Individual player
             var newListener = database.ref("players/"+player.playerName)
             console.log("Creating a listener for: " + player.playerName)
             newListener.on('value', function(snapshot){
                // Broadcast individual player info to client
                console.log("Something changed! Broadcasting..")
                socket.emit("broadcastPlayer", {player: snapshot.val()})
             })
             // Add this listener to list
             dbChangeListeners.push(newListener)
        })
    })
    // Broadcasts all initial players to connectée
    /*
    database.ref("/players/").once('value').then(function(snapshot){
        var players = snapshot.val()
        socket.emit("broadcastPlayers", {players: players})
    })
    */

    socket.on("sign_in", function(data){
        var idToken = data.user
        var user = verifyUser(idToken).then(function(user){
            console.log(user.displayName + " has signed in")
            // Fetch user's playerlist
            database.ref("/users/"+user.uid+"/playerlist").once('value').then(function(snapshot){
                var playerlist = snapshot.val()
                Object.keys(playerlist).forEach(function(player) {
                    var player = playerlist[player] // Individual player
                    database.ref("/players/"+player.battleNet).once('value').then(function(snapshot){
                        socket.emit("playerdata", {player: snapshot.val()})
                    })
                })
            })
        }).catch(function(error){
        })
    })

    socket.on("add_player", function(data){
        var idToken = data.tkn
        var battleNet = data.battleNet
        var user = verifyUser(idToken).then(function(user){
            console.log(user.displayName + " is adding battleNet: " + battleNet)
            axios.get("https://api.lootbox.eu/pc/eu/"+battleNet+"/profile")
            .then(function(response){
                // Player not found
                if (response.data.statusCode == 404){
                    console.log(response.data.error)
                    socket.emit("add_player_failed", {message: response.data.error})
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
            console.log(playerlist)
            if (playerlist !== null && playerlistHasBattleNet(playerlist, battleNet)){
                console.log("Already had battleNet, returning")
                return
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

// Starts an interval which polls the UNOFFICIAL OW -api
var polling = setInterval(function(){
    return;
    // Get all current players in our database
    database.ref("/players/").once('value').then(function(snapshot){
        var players = snapshot.val()
        // Loop through all players
        Object.keys(players).forEach(function(player) {
            var player = players[player] // Individual player

            // GET individual player data from API
            axios.get("https://api.lootbox.eu/pc/eu/"+player.playerName+"/profile")
            .then(function(response){
                var currentPlayerData = response.data.data
                var postData = {
                    avatar: currentPlayerData.avatar,
                    
                };

                
                var timestamp = Math.floor(Date.now() / 1000)
                var newRank = currentPlayerData.competitive.rank
                // Update rank
                database.ref("/players/"+player.playerName).once('value').then(function(snapshot){
                    var player = snapshot.val()
                    var newest = player.ranks[Object.keys(player.ranks)[Object.keys(player.ranks).length-1]]

                    // Update only if rank has changed
                    if (newest.rank != newRank){
                        var newRankRef = database.ref("/players/"+player.playerName+"/ranks").push();
                        newRankRef.set({
                            rank: newRank,
                            timestamp: timestamp
                        });
                    }
                })

                // Update other info
                database.ref("players/"+player.playerName).update(postData)
            })
        });
    })
}, POLLING_INTERVAL)

server.listen(PORT, function () {
  console.log("Up and running at port :: " + PORT)
});
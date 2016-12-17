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
        projectId: "scoretracker-9a7e5",
        clientEmail: "firebase-adminsdk-3j1si@scoretracker-9a7e5.iam.gserviceaccount.com",
        privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEwAIBADANBgkqhkiG9w0BAQEFAASCBKowggSmAgEAAoIBAQDSf2ApHX/aKlos\na7gI1DaQZKKDXEX3bZmsrnvdMQ7ITNLdfPLi3cTDRVplverU0+NRdmNG0ngSHIEl\n4VwUqpeisrO3tEuEr5t1sRmIrQWxekvB1JVDNejIpVLaaPvzwPFMrKyv5KvcWTM4\nnqqUnV+uXALfXlvdsDeMFUe6D2QrOZQF0G3umTnfU8aCMwQu/IkGpzjfGS+6FuCE\n+dcLyIANhIKv42D8UsUClqAbDi/oesRypExWcJmTLinmRteAkbl4szt6kyEzmLs9\nPNcl9h8IeOHiys8m3GNUKg1lYwCFfaAbEDPOwsObx6d/NjfWKItTPt3BDG4IFthQ\nFdZdcJJxAgMBAAECggEBALA6CXSCiO5KNNIpoJprp/688b2N+9mI/XYvYe2ty5Vv\nk73whJvgVIGyx1qUZEyn1BD4T2cUf4eSK6FeCawXofmJKKKso+jC6CDhEuJ1EGYk\nX9Y3tnrdYDTTDAlkiULqDlpF2hEsHaHNX++QDnl7Q4aC67i7k6eGhwqVKkaf6hmw\nhqrzTqtipZPNcd2MiIdr8GD+vRKF5V6aQbJczygqOWVcy7FRNV2/lABxvkn11N3R\nU1xrb0h1w+hTlr6+TNTbDq9R1UTNSJQBernGnT6VBOwaweXpYr7geG2vKcOp9sIH\nRs278ek5dFBRzi/m/aG9FBRjVepTXn6tXnGQMEg28NECgYEA8k1dSTGn+BLpQIQQ\n6OThJg9sRnkWfOFXO9IyuA9FusTrGUu4swvMPxY7MyImkM9UaOMaQI7ksJCdgWBn\nxUD7bin0qHt2u3zWDYZMhGpF0ddX36LfZJqo3V+h5coGNdktRnHD0447q5EOrfF3\n3TaPGIVSSEyVqI6k/IF3AL2Icn0CgYEA3mW6u6txryKrIylB81Tfn3fExArRK93Z\noD6H8Ep3OFhHvHFHNTKMFgI0J5aQAxRJgllSweC/FoPyOG31c1kkcNZ3XvSg/5Y/\nqwQ9mTk8TVE7OK2ZD68g7uTEls7xyJsuR/keKtKns2yiaJQUNRjx6KNA0uyUZ6dZ\nCl9VNClpjgUCgYEAji+sAFmtUbv3OK7HJYO6Q5VlWm2QLrQldqtArBX6O0F3HJ78\nwcS4lIS9NKJjszKXO/2Y2C2CMcKLSvKBspURdnIUahIZeKgnDES0/jdGxX7yx/9R\nzD2dvlpyLOBCiLLrCJ2V5r1ecq1qydQbHKr5idAimt6mLAWY97wZU0vlmBkCgYEA\no1IRz8AXvIW5KBkkVY3+qx1JYq6O7af+Ka/CJLSK2NX72GdX47k7Ju53XpszJw++\n6/qsy7RAoEhFmSsnFY5hNHxLLXB4yzmLiAuVMPDXV/BPjU/vF5WEmetmc1mGNcvA\nMRrBDLGmdh1RJ3uXW2b2P+GjuUIDuhsrSHK6H5RJ8AECgYEAzz9cIdyGmvn28Zj7\no2wL17mhDv8GOaC3RF3zOtO0p/GeoCj6F6jwtnXAyLMv0JoWeNf1uroqkuDy1Bzc\nkKSo5z5hYfQO3MinSDTROlvY6DO7WLEf+hASQ7l2la+4ZfHhJl+3lA6N5bFgqjA+\nbcRgXNJt41yYjYSSKZYsRdj7RTE=\n-----END PRIVATE KEY-----\n"
    }),
    databaseURL: "https://scoretracker-9a7e5.firebaseio.com/"
});

// Initialize Firebase
var config = {
    apiKey: "AIzaSyCmBhbJCioIU0_9AWsrvyhEcZBHgH6S1gI",
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

const PORT = args.port || 3000
const HOST = args.host || 'localhost'
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
                    rankImg: currentPlayerData.competitive.rank_img,
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


server.listen(PORT, HOST);
console.log("Up and running at port :: " + PORT)
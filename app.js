// app.js
var express = require('express')
var app = express()
var server = require('http').createServer(app)
var io = require('socket.io')(server)
var axios = require('axios')

var firebase = require('firebase')
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
    database.ref("/players/").once('value').then(function(snapshot){
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
    database.ref("/players/").once('value').then(function(snapshot){
        var players = snapshot.val()
        socket.emit("broadcastPlayers", {players: players})
    })
})

// Starts an interval which polls the UNOFFICIAL OW -api
var polling = setInterval(function(){
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
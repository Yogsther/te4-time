/**
 * TE4 Time tracker
 * Let's the employes of TE4 check in - and out of their shifts.
 * Users can login through Slack and visit the website and link their key cards.
 * The webserver (this) also connects to check-in console (a Rasberry Pi)
 */

const port = 80

const express = require("express")
const http = require("http")
const md5 = require("md5")
const pug = require("pug")
const fs = require("file-system")
const mysql = require("mysql")
const crypto = require("crypto")

const hash = () => {
    return crypto.randomBytes(20).toString('hex')
}


/* MySQL promise API */
class Database {
    query(sql, args) {
        return new Promise((resolve, reject) => {
            con.query(sql, args, (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }
}

/* Connect to the database */
var db = new Database()
var con = mysql.createConnection({
    host: 'localhost',
    user: 'admin',
    password: 'password',
    database: 'te4'
});

var app = express()
var server = http.createServer(app).listen(port)
var io = require("socket.io")(server)

app.use(express.static(__dirname + '/cdn'))
app.set('view engine', 'pug')

app.use((req, res, next) => {
    if (req.url.indexOf("?") !== -1) {
        req.url = req.url.split("?")[0]
    }
    if (req.path.indexOf('.') === -1) {
        req.url += '.html'
        next()
    } else next()
})

app.get("*", (res, req, next) => {
    var url = res._parsedUrl.path.toString().substr(1)

    if (url.substr(url.lastIndexOf("."), url.length).toLowerCase() == ".html") {
        url = url.substr(0, url.lastIndexOf("."))
        if (url == "") url = "index"
        if (fs.existsSync("views/" + url.toLowerCase() + ".pug")) {
            req.render(url + ".pug")
        }
    } else {
        next()
    }
})

io.on("connection", socket => {
    console.log("CoNnEcTeD :3")
})

console.log(`
        T4 Time started
    ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ 
    ... on port:        ${port}
    Users registered:   ?
`)
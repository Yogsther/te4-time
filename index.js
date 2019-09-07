/**
 * TE4 Time tracker
 * Let's the employes of TE4 check in - and out of their shifts.
 * Users can login through Slack and visit the website and link their key cards.
 * The webserver (this) also connects to check-in console (a Raspberry Pi)
 */

const port = 80

const bp = require("body-parser")
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

const token = "3D86C458712FA798E680DFD3FAF602FB8BAFC144"

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

app.use(bp.json())
app.use(bp.urlencoded({
    extended: true
}))

var server = http.createServer(app).listen(port)
var io = require("socket.io")(server)

console.log(hash().toUpperCase())



app.use(express.static(__dirname + '/cdn'))
app.set('view engine', 'pug')


app.post("/api/check", (req, res) => {
    var body = req.body
    if (body.token === token) {
        if (body.card) {
            if (body.timestamp) {
                end({
                    success: true,
                    check_in: Math.random() > .5,
                    timestamp: Date.now(),
                    name: "Olle Kaiser"
                })
            } else {
                end({
                    success: false,
                    reason: "No timestamp submitted"
                })
            }
        } else {
            end({
                success: false,
                reason: "No card submitted"
            })
        }
    } else {
        end({
            success: false,
            reason: "Invalid token"
        })
    }

    function end(json) {
        res.end((JSON.stringify(json)))
    }
})

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
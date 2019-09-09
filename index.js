/**
 * TE4 Time tracker
 * Let's the employes of TE4 check in - and out of their shifts.
 * Users can login through Slack and visit the website and link their key cards.
 * The webserver (this) also connects to check-in console (a Raspberry Pi)
 */

const bp = require("body-parser")
const express = require("express")
const http = require("http")
const https = require("https")
const md5 = require("md5")
const pug = require("pug")
const fs = require("file-system")
const mysql = require("mysql")
const wrap = require('async-middleware').wrap
const crypto = require("crypto")

const hash = () => {
    return crypto.randomBytes(20).toString('hex')
}

const titles = [
    "Front End Developer",
    "Web Developer",
    "Full Stack Developer",
    "Software Developer",
    "Software Engineer",
    "Junior Software Developer",
    "Senior Software Developer",
    "Software Architect",
    "Systems Architect",
    "Chief Executive Officer",
    "Chief Financial Officer",
    "Chief Technology Officer",
    "Chief Operating Officer"
]

var config

var link_mode = {
    duration: 15,
    started: 0,
    user: 0
}

try {
    config = JSON.parse(fs.readFileSync("config.json"))
} catch (e) {
    console.log("Loading config.json failed, creating a default one.")
    config = {
        port: 80,
        token: hash().toUpperCase(),
        client_id: "CLIENT ID",
        client_secret: "CLIENT SECRET",
        mysql_host: "MYSQL URL",
        mysql_user: "ADMIN",
        mysql_pass: "PASSWORD",
        database: "te4",
        slack_team: "SLACK TEAM URL"
    }
    fs.writeFileSync("config.json", JSON.stringify(config))
}

const port = config.port
var online_users = []

class User {
    constructor(user_id, socket_id) {
        this.user_id = user_id
        this.socket_id = socket_id
    }
}

/* MySQL promise API */
class Database {
    query(sql, args) {
        return new Promise((resolve, reject) => {
            con.query(sql, args, (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            })
        })
    }

    query_one(sql, args) {
        return new Promise((resolve, reject) => {
            con.query(sql, args, (err, rows) => {
                if (err) return reject(err);
                resolve(rows[0])
            })
        })
    }
}

/* Connect to the database */
var db = new Database()
var con = mysql.createConnection({
    host: config.mysql_host,
    user: config.mysql_user,
    password: config.mysql_pass,
    database: config.database
});

var app = express()

app.use(bp.json())
app.use(bp.urlencoded({
    extended: true
}))

var server = http.createServer(app).listen(port)
var io = require("socket.io")(server)

app.use(express.static(__dirname + '/cdn'))
app.set('view engine', 'pug')


app.post("/api/check", async (req, res) => {
    var body = req.body
    /* (async() => { */
    if (body.token === config.token) {
        if (body.card) {
            if (body.timestamp) {
                if (Date.now() - link_mode.started > link_mode.duration * 1000) {
                    end({
                        success: true,
                        check_in: Math.random() > .5,
                        timestamp: Date.now()
                    })
                } else {
                    // LINK MODE
                    await db.query("INSERT into cards (user, serial, active) VALUES (?, ?, ?)", [link_mode.user, body.card, true])
                    end({
                        success: true,
                        write: true,
                        timestamp: Date.now()
                    })
                    console.log("Card linked!")
                }

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
    /*  })() */

    function end(json) {
        res.end((JSON.stringify(json)))
    }
})

app.get("/dashboard", (req, res) => {
    res.render("dashboard")
})

app.get("/", (req, res) => {
    res.render("index")
})

app.get("/admin", (req, res) => {
    res.render("admin")
})

app.get("/auth", (req, res) => {
    if (req.query.code) {
        https.get(`https://slack.com/api/oauth.access?client_id=${config.client_id}&client_secret=${config.client_secret}&code=${req.query.code}`, resp => {
            var data = ''
            resp.on('data', (chunk) => {
                data += chunk
            })
            resp.on('end', () => {
                data = JSON.parse(data)
                if (data.ok) {
                    if (data.team.domain === config.slack_team) {
                        (async () => {
                            var user = await db.query_one("SELECT * FROM users WHERE email = ?", data.user.email)
                            if (user) {
                                // Generate new token for user
                                var token = hash()
                                await db.query("INSERT INTO tokens (user, token, created) VALUES (?, ?, ?)", [user.id, token, Date.now()])
                                res.render("dashboard", {
                                    token
                                })
                            } else {
                                // Create account
                                await db.query("INSERT INTO users (first_name, last_name, email, avatar, access_token, created, barcode) VALUES (?, ?, ?, ?, ?, ?, ?)", [data.user.name.split(" ")[0], data.user.name.split(" ")[1], data.user.email, data.user.image_512, data.access_token, Date.now(), Math.floor(10000000000 + Math.random() * 90000000000)])
                                user = await db.query_one("SELECT * FROM users WHERE email = ?", data.user.email)
                                var token = hash()
                                await db.query("INSERT INTO tokens (user, token, created) VALUES (?, ?, ?)", [user.id, token, Date.now()])
                                res.render("joined", {
                                    token: token,
                                    name: user.first_name + " " + user.last_name,
                                    avatar: user.avatar
                                })
                            }
                        })()
                    } else {
                        res.end("You are not authorized to login with this service.")
                    }

                    console.log(data)
                } else {
                    res.end(data.error)
                }
            })
        })
    }
})

/* app.use((req, res, next) => {
    if (req.url.indexOf("?") !== -1) {
        req.url = req.url.split("?")[0]
    }
    if (req.path.indexOf('.') === -1) {
        req.url += '.html'
        next()
    } else next()
}) */

/* 
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
}) */

io.on("connection", socket => {
    socket.on("get_titles", () => {
        socket.emit("titles", titles)
    })

    socket.on("disconnect", () => {
        for (var i = 0; i < online_users; i++) {
            if (user.socket_id == socket.id) online_users.splice(i, 1)
        }
    })

    socket.on("login", token => {
        if (token) {
            (async () => {
                var db_token = await db.query_one("SELECT * FROM tokens WHERE token = ?", token)
                if (db_token) {
                    var user = await db.query_one("SELECT * FROM users WHERE id = ?", db_token.user)
                    if (user) {
                        user.checked_in = await is_checked_in(user.id)
                        online_users.push(new User(user.id, socket.id))
                        socket.emit("login", user)
                    } else {
                        socket.emit("login", "User does not exist")
                    }
                } else {
                    socket.emit("login", "Invalid token")
                }
            })()
        }
    })

    socket.on("check_in", token => {
        if (token) {
            (async () => {
                var db_token = await db.query_one("SELECT * FROM tokens WHERE token = ?", token)
                if (db_token) {
                    var user = await db.query_one("SELECT * FROM users WHERE id = ?", db_token.user)
                    if (user) {
                        check_in(user.id)
                    }
                }
            })()
        }
    })

    socket.on("get_accounts", token => {
        (async () => {
            var user = await get_user_from_token(token)
            if (user) {
                console.log(user)
                if (user.admin) {
                    var all_users = await db.query("SELECT * FROM users")
                    socket.emit("all_users", all_users)
                }
            }
        })()
    })

    socket.on("link_card", data => {
            if (data.token && data.user) {
                (async () => {
                        var requester = await get_user_from_token(data.token)
                        if (requester) {
                            if (requester.admin) {
                                var user = await db.query_one("SELECT * FROM users WHERE id = ?", data.user)
                                if (user) {
                                    link_mode.started = Date.now()
                                    link_mode.user = user.id
                                }
                                socket.emit("err", "Link initated, duration " + link_mode.duration + " seconds. Please blip the card you would like to link.")
                            } else {
                                socket.emit("err", "Please submit a valid user")
                            }
                        }
                })()
        }
    })

socket.on("set_title", data => {
    if (data.token && data.title) {
        if (titles.indexOf(data.title) != -1) {
            (async () => {
                var token = await db.query_one("SELECT * FROM tokens WHERE token = ?", data.token)
                if (token) {
                    var user = await db.query_one("SELECT * FROM users WHERE id = ?", token.user)
                    if (user) {
                        db.query("UPDATE users SET title = ? WHERE id = ?", [data.title, user.id])
                        socket.emit("title_updated")
                    }
                } else {
                    socket.emit("err", "Invalid token")
                }
            })()
        } else {
            socket.emit("err", "Not a valid title")
        }
    } else {
        socket.emit("err", "Missing fields")
    }
})
})

async function check_in(user_id) {
    var user = await db.query_one("SELECT * FROM users WHERE id = ?", user_id)
    if (user) {
        var user_status = await db.query_one("SELECT * FROM checks WHERE user = ? ORDER BY time DESC LIMIT 1", user_id)

        if (!user_status) {
            user_status = {
                check_in: true
            }
        }

        await db.query("INSERT INTO checks (user, check_in, time) VALUES (?, ?, ?)", [user.id, !user_status.check_in, Date.now()])
        for (online_user of online_users) {

            if (online_user.user_id == user.id) {
                io.to(online_user.socket_id).emit("check_in_update", !user_status.check_in)
            }
        }
    }
}

async function get_user_from_token(token) {
    var db_token = await db.query_one("SELECT * FROM tokens WHERE token = ?", token)
    if (db_token) {
        var user = await db.query_one("SELECT * FROM users WHERE id = ?", db_token.user)
        if (user) {
            return user
        } else {
            return false
        }
    }
}

async function is_checked_in(user_id) {
    var user_status = await db.query_one("SELECT * FROM checks WHERE user = ? ORDER BY time DESC LIMIT 1", user_id)
    return user_status.check_in
}

console.log(`
        T4 Time started
    ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ 
    ... on port:        ${port}
    Users registered:   ?
`)
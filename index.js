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
const QR = require("qrcode")

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
    "Chief Operating Officer",
    "Back End Developer",
    "Dev Ops Developer"
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

function log(msg) {
    var date = new Date()
    console.log(`[${force_length(date.getHours())}:${force_length(date.getMinutes())}:${force_length(date.getSeconds())}] ${msg}`)

    function force_length(value) {
        return value.toString().length == 2 ? value.toString() : '0' + value.toString()
    }
}



app.post("/api/check", async (req, res) => {
    var body = req.body
    if (body.token === config.token) {
        if (body.card) {
            if (body.timestamp) {
                if (Date.now() - link_mode.started > link_mode.duration * 1000) {
                    var card = await db.query_one("SELECT * FROM cards WHERE serial = ?", body.card)
                    if (card) {
                        var user = await db.query_one("SELECT * FROM users WHERE id = ?", card.user)
                        if (user) {
                            var checked_in = await check_in(user.id, "card")
                            end({
                                success: true,
                                write: false,
                                check_in: checked_in,
                                timestamp: Date.now()
                            })

                        } else {
                            end({
                                success: false,
                                reason: "User account has been deleted"
                            })
                        }
                    } else {
                        end({
                            success: false,
                            reason: "Card is not linked"
                        })
                    }
                } else {
                    var existing_card = await db.query_one("SELECT * FROM cards WHERE serial = ?", body.card)
                    if (!existing_card) {
                        // LINK MODE
                        await db.query("INSERT into cards (user, serial, active, created) VALUES (?, ?, ?, ?)", [link_mode.user, body.card, true, Date.now()])
                        end({
                            success: true,
                            write: true,
                            timestamp: Date.now()
                        })
                        for (socket_user of online_users) {
                            if (socket_user.user_id == link_mode.user) {
                                io.to(socket_user.socket_id).emit("write_success", body.card)
                            }
                        }
                        log("Linked card for user " + link_mode.user + ", card: " + body.card)
                        link_mode.user = 0
                        link_mode.started = 0
                    } else {
                        end({
                            success: false,
                            reason: "Card is already linked"
                        })
                    }

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
                                log("Generated a new token for " + user.first_name + " " + user.last_name)
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
                                log("User signed up, " + ser.first_name + " " + user.last_name)
                            }
                        })()
                    } else {
                        res.end("You are not authorized to login with this service.")
                    }
                } else {
                    res.end(data.error)
                }
            })
        })
    }
})

app.get("*", async(req, res) => {
    var id = req.url.substr(1)
    if(!isNaN(Number(req.url.substr(1)))){
        var user = await db.query_one("SELECT * FROM users WHERE barcode = ?", id)
        if(user){
            res.redirect(user.qr_redir)
        }
    }
})

io.on("connection", socket => {

    socket.on("unsync", info => {
        (async() => {
            var user = await get_user_from_token(info.token)
            if(user){
                var card_to_delete = await db.query_one("SELECT * FROM cards WHERE id = ? AND user = ?", [info.id, user.id])
                if(card_to_delete){
                    await db.query("DELETE FROM cards WHERE id = ?", info.id)
                    socket.emit("unsync_success")
                }
            }
        })()
    })

    socket.on("update_qr", info => {
        (async() =>{
            var user = await get_user_from_token(info.token)
            if(user){
                await db.query("UPDATE users SET qr_redir = ? WHERE id = ?", [info.url, user.id])
                socket.emit("qr_update_success", info.url)
            }
        })()
    })

    socket.on("get_titles", () => {
        socket.emit("titles", titles)
    })

    socket.on("disconnect", () => {
        for (var i = 0; i < online_users; i++) {
            if (user.socket_id == socket.id) online_users.splice(i, 1)
        }
    })

    socket.on("request_to_write_card", token => {
        (async () => {
            var user = await get_user_from_token(token)
            if (user) {
                var cards = await db.query("SELECT * FROM cards WHERE user = ?", user.id)
                if (cards.length >= 5) {
                    socket.emit("err", "You can only link 5 cards at a time. Please remove one or more cards and retry.")
                } else {
                    if (Date.now() - link_mode.started > link_mode.duration * 1000) {
                        link_mode.started = Date.now()
                        link_mode.user = user.id
                        socket.emit("read_ready", link_mode.duration)
                    } else {
                        socket.emit("err", "Console is already in link mode, please wait " + Math.ceil(((link_mode.duration * 1000) - (Date.now() - link_mode.started)) / 1000) + " seconds and try again")
                    }
                }
            }
        })()
    })

    socket.on("get_cards_info", token => {
        (async () => {
            var user = await get_user_from_token(token)
            if (user) {
                var cards = await db.query("SELECT * FROM cards WHERE user = ?", user.id)
                socket.emit("my_cards", cards)
            }
        })()
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
                        user.qr = await QR.toDataURL("te4.ygstr.com/" + user.barcode, {
                            rendererOpts: {
                                quality: 1,
                                errorCorrectionLevel: 'H'
                            }
                        })
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
                        check_in(user.id, "web")
                    }
                }
            })()
        }
    })

    socket.on("get_accounts", token => {
        (async () => {
            var user = await get_user_from_token(token)
            if (user) {
                if (user.admin) {
                    var all_users = await db.query("SELECT * FROM users")
                    for (user of all_users) {
                        user.qr = await QR.toDataURL("te4.ygstr.com/" + user.barcode)
                    }
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

async function check_in(user_id, type) {
    var user = await db.query_one("SELECT * FROM users WHERE id = ?", user_id)
    if (user) {
        var checked_in = await is_checked_in(user_id)
        await db.query("INSERT INTO checks (user, check_in, time, type) VALUES (?, ?, ?, ?)", [user.id, !checked_in, Date.now(), type])
        for (online_user of online_users) {
            if (online_user.user_id == user.id) {
                io.to(online_user.socket_id).emit("check_in_update", !checked_in)
            }
        }
        log(user.first_name + " " + user.last_name + " " + (!checked_in ? "checked in" : "checked out") + " via " + type)
        return !checked_in
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
    if (!user_status) return false
    return user_status.check_in
}

console.log(`
        T4 Time started
    ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ 
    ... on port: ${port}
`)
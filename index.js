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
const fs = require("file-system")
const mysql = require("mysql")
const crypto = require("crypto")
const QR = require("qrcode")

const hash = () => {
    return crypto.randomBytes(20).toString('hex')
}

/*  Possible titles to choose from when signing up
    TODO: Add an option for users to change thier title.
*/
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


/**
 * If the console is in link mode, how much time is left and what user it's about to link
 * This variable is checked on every card-check in if (now - started < duration) then the card
 * will be linked to the user 
 */

var link_mode = {
    duration: 15,
    started: 0,
    user: 0
}


/**
 * Load the main config, if the file does not exist or the parse fails, it creates a new file. 
 * TODO: Watch if only the parse fail and perhaps and then don't overwrite the old config
 */

// Global variable for the config, used everytime you want to grab a user-inputed variable
var config

try {
    config = JSON.parse(fs.readFileSync("config.json"))
} catch (e) {
    console.log("Loading config.json failed, creating a default one.")
    config = {
        // Port of the webserver and REST API
        port: 80,
        // Token for the REST API
        token: hash().toUpperCase(),
        // Slack app info
        client_id: "CLIENT ID",
        client_secret: "CLIENT SECRET",
        // mySQL connection information
        mysql_host: "MYSQL URL",
        mysql_user: "ADMIN",
        mysql_pass: "PASSWORD",
        // Database name
        database: "te4",
        // Slack team name of the users who are allowed to sign in
        slack_team: "SLACK TEAM NAME",
        // IP's that are allowed to check in (you can always checkout from any IP). Leave blank to allowed all IP's
        house_ips: []
    }
    fs.writeFileSync("config.json", JSON.stringify(config))
}

// Port of the website and REST API
const port = config.port


/* User of online users. When someone logs in their socket.id is matched to their user id. This allowes us to
   send information via the websocket, ex. when the user checks in via card and the website also updates */
var online_users = []
class User {
    /**
     *  Initiate a new user
     * @param {*} user_id ID of the user (mysql)
     * @param {*} socket_id The sessions (user) socket id (socket.id)
     */
    constructor(user_id, socket_id) {
        this.user_id = user_id
        this.socket_id = socket_id
    }
}

/* MySQL promise API */
class Database {
    /**
     * Normal SQL query but promise based
     * @param {*} sql query
     * @param {*} args possible arguments
     */
    query(sql, args) {
        return new Promise((resolve, reject) => {
            con.query(sql, args, (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            })
        })
    }
    /**
     * SELECT only one item
     * @param {*} sql query
     * @param {*} args possible arguments
     */
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

// Setup the web server via express
var app = express()

// Use body-parser to read json/type in post / get requests
app.use(bp.json())
app.use(bp.urlencoded({
    extended: true
}))

// Create the server and start it on the port in config.json
var server = http.createServer(app).listen(port)
// Bind socket.io to the webserver, (socket.io, REST API and the website are all on the same port)
var io = require("socket.io")(server)

// Bind the cdn folder to the webserver, everything in it is accessable via the website
app.use(express.static(__dirname + '/cdn'))
// Enable PUG rendering in the express app
app.set('view engine', 'pug')

/**
 * Log messages with an included timestamp
 * @param {*} msg Message to log
 */
function log(msg) {
    var date = new Date()
    console.log(`[${force_length(date.getHours())}:${force_length(date.getMinutes())}:${force_length(date.getSeconds())}] ${msg}`)

    function force_length(value) {
        return value.toString().length == 2 ? value.toString() : '0' + value.toString()
    }
}


/**
 * REST API
 * 
 * POST /api/check
 * 
 *      Required fields:
 *          {
 *              token: (String) authentication token (config.json:token)
 *              card: (String | Integer) Serial or ID of the card (NFC)
 *          }
 * 
 *      Called whenever a card is registered on the NFC console
 *      the response (JSON) will always include the attribute "success" (if the action did something)
 *      If success is true, it will also include "write" (if the card was linked to a user)
 *      if success is false, a "reason" will be included
 */

app.post("/api/check", async (req, res) => {
    /* Body of the request is the package with content (token, serial) */
    var body = req.body
    /* Make sure token is provided */
    if (body.token === config.token) {
        /* Make sure the card is also included */
        if (body.card) {
            /* Check if the latest link process has gone over the duration, if not link the card submitted */
            if (Date.now() - link_mode.started > link_mode.duration * 1000) {
                /**
                 * Check in the user via card
                 * Get the card from te4:cards in the database via it's serial
                 */
                var card = await db.query_one("SELECT * FROM cards WHERE serial = ?", body.card)
                /* Maker sure the card exists in the database */
                if (card) {
                    /* Get coresponding user form the database (te4:users) */
                    var user = await db.query_one("SELECT * FROM users WHERE id = ?", card.user)
                    /* Make sure the user also exists (this is important if users are deleted and cards are still linked) */
                    /* TODO: If the user doesn't exists it should delete the card from the database */
                    if (user) {
                        /* Check in the user */
                        var checked_in = await check_in(user.id, "card")
                        /* Responde the the request with a successfull check-in or check-out */
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
                /* LINK CARD TO USER */
                /* Check if the card is already indexed in the database */
                var existing_card = await db.query_one("SELECT * FROM cards WHERE serial = ?", body.card)
                if (!existing_card) {
                    /* Card is not in the database, link it! */
                    /* Insert a new card into the database and response with success and write */
                    await db.query("INSERT into cards (user, serial, active, created) VALUES (?, ?, ?, ?)", [link_mode.user, body.card, true, Date.now()])
                    end({
                        success: true,
                        write: true,
                        timestamp: Date.now()
                    })
                    /* Check if the user is still in the browser and send a success flag to their live websocket */
                    for (socket_user of online_users) {
                        if (socket_user.user_id == link_mode.user) {
                            io.to(socket_user.socket_id).emit("write_success", body.card)
                        }
                    }

                    log("Linked card for user " + link_mode.user + ", card: " + body.card)
                    /* Reset link-mode so that is is now avalible again */
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
                reason: "No card submitted"
            })
        }
    } else {
        end({
            success: false,
            reason: "Invalid token"
        })
    }

    /**
     * Responde to the request with a JSON
     * @param {*} json Response
     */
    function end(json) {
        res.end((JSON.stringify(json)))
    }
})

/* Express routes */

app.get("/dashboard", (req, res) => {
    res.render("dashboard")
})

app.get("/", (req, res) => {
    res.render("index")
})

app.get("/admin", (req, res) => {
    res.render("admin")
})

/* API callback when authenticating with the slack login */
app.get("/auth", (req, res) => {
    /* Make sure the slack code is submitted */
    if (req.query.code) {
        /* Send a request to slack to get user information from the login */
        https.get(`https://slack.com/api/oauth.access?client_id=${config.client_id}&client_secret=${config.client_secret}&code=${req.query.code}`, resp => {
            var data = ''
            resp.on('data', (chunk) => {
                data += chunk
            })
            resp.on('end', () => {
                /* Once the data has been downloaded, parse it into a JSON */
                data = JSON.parse(data)
                /* If the request and code was successfull */
                if (data.ok) {
                    /** 
                     * Make sure the slack team domain is correct (config.json:slack_team) 
                     * This is so only authorized people (people in your team) are allowed to login and 
                     * use the website
                     */
                    if (data.team.domain === config.slack_team && config.slack_team.length > 0) {
                        (async () => {
                            /* Check if the user is already signed up */
                            var user = await db.query_one("SELECT * FROM users WHERE email = ?", data.user.email)
                            if (user) {
                                /* If they are, generate a new login token for the user */
                                var token = hash()
                                /* Save the new token */
                                await db.query("INSERT INTO tokens (user, token, created) VALUES (?, ?, ?)", [user.id, token, Date.now()])
                                /* Send them to the dashboard with the new token (it will be saved in their localStorage, then they will be redirected) */
                                res.render("dashboard", {
                                    token
                                })
                                log("Generated a new token for " + user.first_name + " " + user.last_name)
                            } else {
                                /* Create a new account for the user */
                                await db.query("INSERT INTO users (first_name, last_name, email, avatar, access_token, created, barcode) VALUES (?, ?, ?, ?, ?, ?, ?)", [data.user.name.split(" ")[0], data.user.name.split(" ")[1], data.user.email, data.user.image_512, data.access_token, Date.now(), Math.floor(10000000000 + Math.random() * 90000000000)])
                                /* Retrieve the new account */
                                user = await db.query_one("SELECT * FROM users WHERE email = ?", data.user.email)
                                /* Generate login token for the user */
                                var token = hash()
                                /* Save token to database */
                                await db.query("INSERT INTO tokens (user, token, created) VALUES (?, ?, ?)", [user.id, token, Date.now()])
                                /* Redirect them to the first-time setup page */
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

/**
 * Express route to catch all other pages
 * This is mainly to redirect QR codes for users
 */
app.get("*", async (req, res) => {
    /* Get the page minus the slash ([/]9834983) */
    var id = req.url.substr(1)
    /* For QR codes (that are actually barcodes) make sure it's a number */
    if (!isNaN(Number(req.url.substr(1)))) {
        /* Get the user from the database */
        var user = await db.query_one("SELECT * FROM users WHERE barcode = ?", id)
        if (user) {
            /* Redirect client to the users qr-code redir choice */
            res.status(301).redirect(user.qr_redir)
        }
    }
})

/* SOCKET.IO Functions */
io.on("connection", socket => {

    /* Unsync (unlink) cards */
    socket.on("unsync", info => {
        (async () => {
            /* Get user from database */
            var user = await get_user_from_token(info.token)
            /* Make sure user exists */
            if (user) {
                /* Get the card to be unsynced */
                var card_to_delete = await db.query_one("SELECT * FROM cards WHERE id = ? AND user = ?", [info.id, user.id])
                if (card_to_delete) {
                    /* Delete the card */
                    await db.query("DELETE FROM cards WHERE id = ?", info.id)
                    socket.emit("unsync_success")
                }
            }
        })()
    })

    /* Update QR codes redirect link */
    socket.on("update_qr", info => {
        (async () => {
            var user = await get_user_from_token(info.token)
            if (user) {
                /* Update QR code in the database */
                await db.query("UPDATE users SET qr_redir = ? WHERE id = ?", [info.url, user.id])
                socket.emit("qr_update_success", info.url)
            }
        })()
    })

    /* Get job-titles, for first-time signup */
    socket.on("get_titles", () => {
        socket.emit("titles", titles)
    })

    /* Remove users from online_users when they disconnect from the websocket */
    socket.on("disconnect", () => {
        /* Loop through all users and match their socket_id */
        for (var i = 0; i < online_users; i++) {
            /* Splice them if they match (remove from the array) */
            if (user.socket_id == socket.id) online_users.splice(i, 1)
        }
    })

    /* User requests to initiate link mode with their account to link a card */
    socket.on("request_to_write_card", token => {
        (async () => {
            var user = await get_user_from_token(token)
            if (user) {
                /* Get all cards from the user to make sure they are allowed to link more cards (max 5) */
                var cards = await db.query("SELECT * FROM cards WHERE user = ?", user.id)
                if (cards.length >= 5) {
                    socket.emit("err", "You can only link 5 cards at a time. Please remove one or more cards and retry.")
                } else {
                    /* If the console is not already in link mode, initiate it. */
                    if (Date.now() - link_mode.started > link_mode.duration * 1000) {
                        /* Initiate link mode */
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

    /** 
     * User requests to get the info of their cards.
     * Used in the card preview page where you link and unlink cards
     */
    socket.on("get_cards_info", token => {
        (async () => {
            var user = await get_user_from_token(token)
            if (user) {
                var cards = await db.query("SELECT * FROM cards WHERE user = ? ORDER BY id DESC", user.id)
                socket.emit("my_cards", cards)
            }
        })()
    })

    /* Login user, can only be done through a login-token */
    socket.on("login", token => {
        /* Make sure the token is defined */
        if (token) {
            (async () => {
                /* Check token in the te4:token table and get the user id */
                var db_token = await db.query_one("SELECT * FROM tokens WHERE token = ?", token)
                if (db_token) {
                    var user = await db.query_one("SELECT * FROM users WHERE id = ?", db_token.user)
                    if (user) {
                        /* Get the IP of the user */
                        var ip = socket.handshake.headers["x-real-ip"]
                        /** 
                         * Update user privilege 
                         * If the user is on one of the config.json:house_ips they
                         * have privilege and can check in, otherwise if the privilege is false
                         * they can only checkout. This is to prevent users from checking in when they are not
                         * in the facility. Perhaps we may add a feature to checkin from home in a special mode
                         * and that their shifts are marked as "from home"
                         */
                        user.privilege = (config.house_ips.indexOf(ip) != -1 && config.house_ips.length > 0)
                        /* Update the users check-in status */
                        user.checked_in = await is_checked_in(user.id)
                        /* Add user to the online_users array */
                        online_users.push(new User(user.id, socket.id))
                        /* Render the users QR code */
                        user.qr = await QR.toDataURL("te4.ygstr.com/" + user.barcode, {
                            rendererOpts: {
                                quality: 1,
                                errorCorrectionLevel: 'H'
                            }
                        })
                        /* Emit all login information */
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

    /* Checking in / out via web */
    socket.on("check_in", token => {
        if (token) {
            (async () => {
                var db_token = await db.query_one("SELECT * FROM tokens WHERE token = ?", token)
                if (db_token) {
                    var user = await db.query_one("SELECT * FROM users WHERE id = ?", db_token.user)
                    if (user) {
                        /* Get IP and make sure the user is allowed to check in from that location */
                        var ip = socket.handshake.headers["x-real-ip"]
                        if((config.house_ips.indexOf(ip) != -1 && config.house_ips.length > 0)){
                            check_in(user.id, "web")
                        } else {
                            socket.emit("err", "You are not on any of the house IP's")
                        }
                    }
                }
            })()
        }
    })

    /**
     * Get all accounts
     * Only allowed for admin accounts
     * Get's a list of all users. Used for card generator and teacher monitoring
     */
    socket.on("get_accounts", token => {
        (async () => {
            var user = await get_user_from_token(token)
            if (user) {
                /* Make sure the user is admin */
                if (user.admin) {
                    /* Query all users */
                    var all_users = await db.query("SELECT * FROM users")
                    for (user of all_users) {
                        /* Generate their QR codes */
                        user.qr = await QR.toDataURL("te4.ygstr.com/" + user.barcode)
                    }
                    /* Emit all users */
                    socket.emit("all_users", all_users)
                }
            }
        })()
    })

    /**
     * ! DEPRECATED
     * Was used to link cards as an admin. Now it's no longer used.
     * See socket.on("request_to_write_card") for the new function
     */
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

    /* Get check in history to be visualised on the front page */
    // TODO: Show history between two dates (from: 1900000 -> Date.now())
    socket.on("get_history", info => {
        (async () => {
            var user = await get_user_from_token(info.token)
            if (user) {
                var history = await db.query("SELECT * FROM checks WHERE user = ?", user.id)
                socket.emit("history", history)
            }
        })()
    })

    /* Set job title in the setup screen. Could be allowed in the future for people in some other menu to change after the fact */
    socket.on("set_title", data => {
        /* Make sure a title and token is provided */
        if (data.token && data.title) {
            /* Make sure the title is valid (exists in the titles array) */
            if (titles.indexOf(data.title) != -1) {
                (async () => {
                    var token = await db.query_one("SELECT * FROM tokens WHERE token = ?", data.token)
                    if (token) {
                        var user = await db.query_one("SELECT * FROM users WHERE id = ?", token.user)
                        if (user) {
                            /* Update their title */
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

/**
 * Check in or out a user
 * @param {Int} user_id ID of the user
 * @param {String} type Type of check-in (web, card)
 */
async function check_in(user_id, type) {
    var user = await db.query_one("SELECT * FROM users WHERE id = ?", user_id)
    if (user) {
        var checked_in = await is_checked_in(user_id)
        var original_time = Date.now()
        var users_last_check = await db.query_one("SELECT * FROM checks WHERE user = ? ORDER BY original_time DESC", user_id)
        if (users_last_check) {
            if ((Date.now() - users_last_check.original_time) < 60 * 1000 /* One minute */ ) {
                original_time = users_last_check.original_time
                await db.query("DELETE FROM checks WHERE id = ?", users_last_check.id) // Delete last check
                console.log("DELETED")
            }
        }
        await db.query("INSERT INTO checks (user, check_in, time, type, original_time) VALUES (?, ?, ?, ?, ?)", [user.id, !checked_in, Date.now(), type, original_time])
        for (online_user of online_users) {
            if (online_user.user_id == user.id) {
                io.to(online_user.socket_id).emit("check_in_update", !checked_in)
            }
        }
        log(user.first_name + " " + user.last_name + " " + (!checked_in ? "checked in" : "checked out") + " via " + type)
        return !checked_in
    }
}

/**
 * Get a user (te4:users) via their login token (te4:tokens)
 * @param {*} token The users login token
 */
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

/**
 * Check if a user is checked in
 * @param {*} user_id ID of the user
 */
async function is_checked_in(user_id) {
    var user_status = await db.query_one("SELECT * FROM checks WHERE user = ? ORDER BY original_time DESC LIMIT 1", user_id)
    if (!user_status) return false
    return user_status.check_in
}

/* Startup screen */
console.log(`
        T4 Time started
    ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ 
    ... on port: ${port}
`)
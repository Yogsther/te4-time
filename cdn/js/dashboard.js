if (document.getElementById("token").innerText != "") {
    token = document.getElementById("token").innerText
    localStorage.setItem("token", token)
    location.href = "/dashboard"
} else {
    if (!token) {
        location.href = "/"
    }
}

var my_cards = []
var images_loaded = false

function load() {
    var loaded = 0
    for (var image in images) {
        var src = images[image]
        images[image] = new Image()
        images[image].onload = () => {
            complete()
        }
        images[image].src = src
    }

    function complete() {
        loaded++
        if (loaded >= Object.keys(images).length) {
            images_loaded = true
            if (me) generate_card_on_canvas()
        }
    }
}


on_login = () => {
    update_check_in_status(me.checked_in)

    // Loads images
    images.qr = me.qr
    load()
    get_history()
}


function update_check_in_status(checked_in) {
    me.checked_in = checked_in
    document.getElementById("favicon").href = checked_in ? "img/logo_64.png" : "img/logo_256_black.png"
    //document.getElementById("welcome-banner").innerHTML = "Welcome back " + me.first_name + ", " +
    //   (checked_in ? "<span id='checked-in-status'>checked in</span>" : "<span id='checked-in-status-out'>checked out</span>")
    var check_in_button = document.getElementById("check-in-button")
    check_in_button.innerText = (checked_in ? "check out" : "check in")
    if (checked_in) {
        check_in_button.classList.remove("mdc-button--raised")
        check_in_button.classList.add("mdc-button--outlined")
    } else {
        check_in_button.classList.add("mdc-button--raised")
        check_in_button.classList.remove("mdc-button--outlined")
    }

    document.getElementById("header-logo").src = checked_in ? "img/logo_256.png" : "img/logo_256_black.png"
    document.documentElement.style.setProperty("--red", checked_in ? "#ff1e54" : "#111")

    if (images_loaded) generate_card_on_canvas()
}

on_login_fail = (msg) => {
    location.href = "/"
}

socket.on("check_in_update", checked_in => {
    update_check_in_status(checked_in)
})



var overlay_open = false

document.addEventListener("mousedown", e => {
    if (e.target.id == "card_img") return

    var click_outside = true
    for (var el of e.composedPath()) {
        if (el.id == "overlay-window") {
            click_outside = false
        }
    }
    if (click_outside) {
        close_overlay()
    }
})

function close_overlay() {
    overlay_open = false
    document.getElementById("overlay").style.visibility = "hidden"
}

function open_card_menu() {

    socket.emit("get_cards_info", token)
    overlay_open = true
    document.body.scrollTop = document.documentElement.scrollTop = 0
    var overlay = document.getElementById("overlay")
    overlay.style.visibility = "visible"
    overlay.innerHTML = `
    <div id="overlay-window">
        <input id="link-input" value="${me.qr_redir == null ? "" : me.qr_redir}" oninput="update_qr(this)" placeholder="Enter URL for your QR-code"></input>
   
        <svg version="1" id="url-status" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" enable-background="new 0 0 48 48">
            <polygon points="40.6,12.1 17,35.7 7.4,26.1 4.6,29 17,41.3 43.4,14.9"/>
        </svg>
        <div id="sync-window"><span id="sync-status">Ready to link</span><button class="mdc-button mdc-button--raised"
            id="link-button-overlay" onclick="add_card()">add new card</button></div>
            <span id="synced-cards"></span>
        
    </div>`
    insert_synced_cards()
}

socket.on("my_cards", recived_cards => {
    my_cards = recived_cards
    insert_synced_cards()
})


var update_qr_url
var loading_gif = new Image()
loading_gif.src = "img/loading.gif"

function update_qr(el) {
    update_qr_url = el.value
    me.qr_redir = el.value
    socket.emit("update_qr", {
        token: token,
        url: update_qr_url
    })
    document.getElementById("url-status").style.fill = "#ffcb21"
}

socket.on("qr_update_success", url => {
    if (url == update_qr_url) {
        document.getElementById("url-status").style.fill = "#32d142"
    }
})

function insert_synced_cards() {
    var cardhodler = document.getElementById("synced-cards")
    if (cardhodler) {
        var build = ""
        for (var card of my_cards) {
            var date = new Date(card.created)
            build += `<div class="added-card"><button class="mdc-button remove-card-button" onclick="unsync(${card.id})">remove</button>
            <span class="serial-text">Serial: <span class="serial">
                ${card.serial}
            </span>
        </span>
        <span class="card-date">${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()}</span>
        </div>`
        }
        cardhodler.innerHTML = build
    }
}

function unsync(id) {
    socket.emit("unsync", {
        id,
        token
    })
}

socket.on("unsync_success", () => {
    socket.emit("get_cards_info", token)
})

function add_card() {
    socket.emit("request_to_write_card", token)
}

var started_syncing = 0
var syncing_time = 0
var write_succes = false
var syncing_interval

socket.on("read_ready", time => {
    started_syncing = Date.now()
    syncing_time = time
    write_succes = false
    document.getElementById("sync-status").innerHTML = "Syncing " + time + "s"
    syncing_interval = setInterval(() => {
        if (write_succes) {
            clearInterval(write_succes)
            return
        }
        var time_left = (syncing_time * 1000) - (Date.now() - started_syncing)
        if (time_left > 0) {
            document.getElementById("sync-status").innerHTML = "Syncing " + force_lengt(Math.round(time_left / 100) / 10) + "s"

            function force_lengt(input) {
                if (input.toString().indexOf(".") == -1) return input.toString() + ".0"
                return input
            }
        } else {
            clearInterval(syncing_interval)
            document.getElementById("sync-status").innerHTML = "Ready to link"
        }
    }, 100);
})

socket.on("write_success", serial => {
    socket.emit("get_cards_info", token)
    clearInterval(syncing_interval)
    write_succes = true
    document.getElementById("sync-status").innerHTML = "<span style='color:#72ff36;'>Success!</span>"
})

function generate_card_on_canvas() {
    document.getElementById("card_img").src = generate_card(me, Boolean(me.checked_in))
    resize_card()

}

function resize_card() {
    var card_height = document.getElementById("content").getBoundingClientRect().height
    var card = document.getElementById("card_img");
    card.style.height = card_height - 100 + "px"
    document.getElementById("card").style.borderRadius = card_height / 25 + "px"
    view_mode(true)
}

window.onresize = () => {
    resize_card()
    view_mode()
}

function check_in() {
    socket.emit("check_in", token)
}

function get_history() {
    var to = Date.now()
    var from = Date.now() - (1000 * 60 * 24 * 5)
    socket.emit("get_history", {
        from,
        to,
        token
    })
}


socket.on("history", h => {
    format_days(h)
})

function view_mode() {
    var mobile = (document.body.offsetWidth <= 1130)
    var card = document.getElementById("card")
    var history = document.getElementById("history")
    var logo = document.getElementById("header-logo")

    if (mobile) {
        // Mobile mode
        history.style.width = "calc(100% - 50px)"
       

        var card_width = card.offsetWidth
        card.remove()
        card.style.display = "block"
        card.style.position = "relative"
        card.style.top = "20px"
        card.style.right = "0px"
        card.style.marginBottom = "50px"
        card.style.left = ((document.getElementById("second-card-position").offsetWidth / 2) - (card_width / 2)) + "px"
        card.style.float = "left"

        history.style.display = "block"
        history.style.margin = "0 auto"
        document.getElementById("second-card-position").appendChild(card)


    

    } else {
        // Desktop mode
        card.remove()
        card.style.right = "-50px"
        card.style.top = "50px"
        card.style.float = "right"
        card.style.marginBottom = "0px"
        card.style.margin = null
        card.style.left = null

        history.style.display = null
        history.style.marginLeft = "50px"
        history.style.width = "600px"

        document.getElementById("content").appendChild(card)
    }

}



var days

function format_days(h) {
    if (h.length == 0) {
        render_history()
        return
    }
    // Days to export for render at most 5 days
    days = []
    window.days_indexes = []
    for (var i = 0; i < 5; i++) {
        var date = get_day(h[0].time + (1000 * 60 * 60 * 24) * i)
        days[date] = []
        days_indexes.push(date)
    }

    var day = get_day(h[0].time)
    var days_index = 0
    var checked_in = false
    var out = false

    for (var check of h) {
        while (get_day(check.time) != day) {
            if (days_index > days.length) {
                out = true
                break
            }
            // New day
            days_index++
            day = get_day(check.time)
            checked_in = false
        }
        if (out) break

        if (check.check_in != checked_in) {
            days[days_indexes[days_index]].push(check)
            checked_in = check.check_in
        }
    }



    if (me.checked_in) {
        var today_in_days = days[get_day(Date.now())]
        if (today_in_days) {
            today_in_days.push({
                check_in: false,
                time: Date.now(),
                original_time: Date.now()
            })
        }
    }

    render_history()

    function get_day(ms) {
        var date = new Date(ms)
        return date.getDate() + "." + date.getMonth() + "." + date.getFullYear()
    }
}

var history_progress = undefined
var total_width = 0

function render_history() {
    var drawn_width = 0
    var canvas = document.getElementById("history")
    var ctx = canvas.getContext("2d")
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    var height = canvas.height
    var margin = 50
    var hours = [7, 18]
    var hours_width = (canvas.width - margin * 2) / (hours[1] - hours[0] - 1) // px
    var day_height = 50
    var margin_top = 25

    ctx.fillStyle = "grey"
    ctx.font = "Georgia 12px"
    ctx.textAlign = "center"
    for (var i = 0; i < hours[1] - hours[0]; i++) {
        ctx.fillRect((i * hours_width) + margin, margin, 2, height - (margin * 2))
        ctx.fillText(i + hours[0], i * hours_width + margin, margin - 10)
    }

    var names_of_days = ["Sun", "Mon", "Thu", "Wed", "Thu", "Fri", "Sat"]
    if (days) {
        for (var i = 0; i < Object.keys(days).length; i++) {
            ctx.fillStyle = "grey"
            ctx.textAlign = "right"
            var day_in_string = days_indexes[i].split(".")
            var day_in_date = new Date([Number(day_in_string[1]) + 1, day_in_string[0], day_in_string[2]].join("-"))
            ctx.fillText(names_of_days[day_in_date.getDay()], margin - 10, (i * day_height) + margin_top + margin + 15)

            //ctx.fillText(names_of_days[new Date(d.split(".").join("-"))].getDay(), 100, 100)
            var check_in = false
            var check_in_date
            for (var check of days[days_indexes[i]]) {
                if (check.check_in) {
                    check_in = true
                    check_in_date = new Date(check.original_time)
                } else if (!check.check_in && check_in) {
                    // Draw time
                    var gradient = ctx.createLinearGradient(20, 0, 220, 0);
                    gradient.addColorStop(0, '#21943b');
                    gradient.addColorStop(1, '#34eb5e');

                    ctx.fillStyle = gradient
                    var check_out_date = new Date(check.original_time)
                    var start_x = (check_in_date.getHours() - hours[0]) * hours_width + margin + (check_in_date.getMinutes() / 60 * hours_width)
                    var stop_x = (check_out_date.getHours() - hours[0]) * hours_width + margin + (check_out_date.getMinutes() / 60 * hours_width)
                    if (history_progress === undefined) total_width += stop_x - start_x
                    else {
                        var width_left = (total_width * history_progress) - drawn_width
                        if (width_left <= 0) break
                        var width = stop_x - start_x
                        if (width > width_left) width = width_left
                        drawn_width += width
                        ctx.roundRect(start_x, margin + margin_top + (i * day_height), width, 20, 100).fill()
                    }
                }
            }
        }
        if (history_progress == undefined) history_progress = 0
        history_progress += .06 - (history_progress * .059)
        if (history_progress < 1) requestAnimationFrame(render_history)
    }
}


CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    this.beginPath();
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
}
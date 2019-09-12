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
            if (me) generate_card_on_canvas()
        }
    }
}


on_login = () => {
    update_check_in_status(me.checked_in)

    // Loads images
    images.qr = me.qr
    load()
}

function update_check_in_status(checked_in) {
    me.checked_in = checked_in
    document.getElementById("welcome-banner").innerHTML = "Welcome back " + me.first_name + ", " +
        (checked_in ? "<span id='checked-in-status'>checked in</span>" : "<span id='checked-in-status-out'>checked out</span>")
    var check_in_button = document.getElementById("check-in-button")
    check_in_button.innerText = (checked_in ? "check out" : "check in")
    if (checked_in) {
        check_in_button.classList.remove("mdc-button--raised")
        check_in_button.classList.add("mdc-button--outlined")
    } else {
        check_in_button.classList.add("mdc-button--raised")
        check_in_button.classList.remove("mdc-button--outlined")
    }
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
    var overlay = document.getElementById("overlay")
    overlay.style.visibility = "visible"
    overlay.innerHTML = `
    <div id="overlay-window">
        <input id="link-input" value="${me.qr_redir == null ? "" : me.qr_redir}" oninput="update_qr(this)" placeholder="Enter URL for your QR-code"></input>
        <img src="img/check.png" id="url-status">
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
function update_qr(el){
    update_qr_url = el.value
    me.qr_redir = el.value
    socket.emit("update_qr", {token: token, url: update_qr_url})
    document.getElementById("url-status").src = loading_gif.src
}

socket.on("qr_update_success", url => {
    if(url == update_qr_url){
        document.getElementById("url-status").src = "img/check.png"
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

function unsync(id){
    socket.emit("unsync", {id, token})
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
    document.getElementById("card_img").src = generate_card()
    resize_card()
}

function resize_card() {
    var card_height = document.getElementById("content").getBoundingClientRect().height
    var card = document.getElementById("card_img");
    card.style.height = card_height - 100 + "px"
    document.getElementById("card").style.borderRadius = card_height / 25 + "px"
}

window.onresize = () => {
    resize_card()
}

function check_in() {
    socket.emit("check_in", token)
}

load()
var all_users

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

        }
    }
}


socket.emit("get_accounts", token)

socket.on("all_users", users => {
    all_users = users
    /* generate_page(users) */
    var html = ""
    for(var user of users){
        html+=`<option value="${user.id}">${user.first_name} ${user.last_name}</option>`
    }
    document.getElementById("choose-account").innerHTML += html
})

function add_account(el){
    document.getElementById("selected-users").innerHTML += `
        <div class="selected-user">
            <button onclick="remove(${el.value})">x</button>
            <span class="name-selected" user-id="${el.value}">${get_user(el.value).first_name + " " + get_user(el.value).last_name}</span>
        </div>
    `
    el.value = ""
}

function generate(){
    var users = []
    for(var el of document.getElementById("selected-users").children){
        users.push(get_user(el.children[1].getAttribute("user-id")))
    }
    console.log(users)
    generate_page(users)
}

function remove(id){
    for(var el of document.getElementById("selected-users").children){
        if(el.children[1].getAttribute("user-id") == id){
            el.remove()
        }
    }
}

function get_user(id){
    for(user of all_users){
        if(user.id == id){
            return user
        }
    }
}

/**
 * A4 PRINT SIZE:     210  x 297  mm
 * CARD SIZE:         86   x 54   mm
 * TE4 VIRTUAL CARD:  1000 x 630  px
 * TE4 VIRTUAL PRINT: 2441 x 3453 px
 * 
 * Width holds  3 cards
 * Height holds 3 cards
 * 9 cards per page
 */

var cards = []
var cards_ready = 0

function generate_page(users){
    for(user of users){
        user.qr_img = new Image()
        user.qr_img.onload = () => {

            var card = generate_card(users[cards_ready])
            cards.push(new Image())
            cards[cards.length-1].src = card
            cards_ready++
            if(cards_ready == users.length){
                generate_page_of_cards(cards)
            }
        }
        user.qr_img.src = user.qr
    }
}

function generate_page_of_cards(cards){
    var canvas = document.createElement("canvas")
    var ctx = canvas.getContext("2d")
    canvas.width = 2441
    canvas.height = 3453

    for(var i = 0; i < cards.length; i++){
        var x_pos = i % 3
        var top_pos = Math.floor(i / 3)
        var card = cards[i]
        ctx.drawImage(card, x_pos * card.width, top_pos * card.height)
    }

    document.getElementById("output").src = canvas.toDataURL()

}
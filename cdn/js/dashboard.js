if(document.getElementById("token").innerText != ""){
    token = document.getElementById("token").innerText
    localStorage.setItem("token", token)
    location.href = "/dashboard"
} else {
    if(!token){
        location.href = "/"
    }
}


on_login = () => {
    update_check_in_status(me.checked_in)
    generate_card()
}

function update_check_in_status(checked_in){
    me.checked_in = checked_in
    document.getElementById("welcome-banner").innerHTML = "Welcome back " + me.first_name + ", " +
    (checked_in ? "<span id='checked-in-status'>checked in</span>" : "<span id='checked-in-status-out'>checked out</span>")
    var check_in_button = document.getElementById("check-in-button")
    check_in_button.innerText = (checked_in ? "check out": "check in")
    if(checked_in){
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

var images = {
    nti: "img/nti.png",
    logo: "img/logo_256_black.png",
    strip: "img/strip.png",
    contactless: "img/contactless.png"
}

socket.on("check_in_update", checked_in => {
    console.log("REEE")
    update_check_in_status(checked_in)  
})

// Loads images
load()
function load(){
    var loaded = 0
    for(var image in images){
        var src = images[image]
        images[image] = new Image()
        images[image].onload = () => {
            complete()
        }
        images[image].src = src
    }
    function complete(){
        loaded++
        if(loaded >= Object.keys(images).length){
            generate_card()
        }
    }
}

function generate_card() {
    if(!me) return
    var canvas = document.createElement("canvas")
    canvas.height = 1000
    canvas.width = 630
    var ctx = canvas.getContext("2d")

    var logo = images.logo
    var nti = images.nti
    var strip = images.strip

    ctx.fillStyle = "white"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    var strip_scale = 1
    ctx.drawImage(strip, 135, 700, strip.width * strip_scale, strip.height * strip_scale)

    var barcode = document.createElement("canvas")
    var barcode_scale = 1.5
    JsBarcode(barcode, me.barcode, {
        format: "upc"
    })

    ctx.font = "90px Georgia"
    ctx.fillStyle = "black"
    ctx.fillText(me.last_name, 80, 150)
    ctx.fillText(me.first_name, 80, 260)

    var nti_scale = .8


    ctx.drawImage(barcode, (canvas.width / 2 - (barcode.width / 2) * barcode_scale), (canvas.height - 100 - (barcode.height * barcode_scale)), barcode.width * barcode_scale, barcode.height * barcode_scale)
    ctx.drawImage(logo, 35, 735, 100, 100)
    ctx.drawImage(nti, (canvas.width / 2 - (nti.width / 2) * nti_scale), (canvas.height - 350 - (nti.height * nti_scale)), nti.width * nti_scale, nti.height * nti_scale)

    ctx.drawImage(images.contactless, 470, 120, 100, 100)

    ctx.font = "30px Georgia"
    ctx.fillText(me.title, 80, 320)


    // Render out
    document.getElementById("card_img").src = canvas.toDataURL("image/png")
    resize_card()
}

function resize_card() {
    document.getElementById("card_img").style.height = document.getElementById("content").getBoundingClientRect().height - 100 + "px"
}


window.onresize = () => {
    resize_card()
}

function check_in(){
    socket.emit("check_in", token)
}
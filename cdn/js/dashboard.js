var strip = new Image()
var nti = new Image()
var logo = new Image()

logo.onload = () => {
    generate_card()
}

strip.src = "img/strip.png"
nti.src = "img/nti.png"
logo.src = "img/logo_256_black.png"

function generate_card() {
    var canvas = document.createElement("canvas")
    canvas.height = 1000
    canvas.width = 630
    var ctx = canvas.getContext("2d")

    ctx.fillStyle = "white"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    var strip_scale = .75
    ctx.drawImage(strip, -50, 775, strip.width * strip_scale, strip.height * strip_scale)

    var barcode = document.createElement("canvas")
    var barcode_scale = 1.5
    JsBarcode(barcode, "96942089960", {
        format: "upc"
    })

    ctx.font = "90px Georgia"
    ctx.fillStyle = "black"
    ctx.fillText("Kaiser", 80, 150)
    ctx.fillText("Olle", 80, 260)

    var nti_scale = .8

    ctx.drawImage(barcode, (canvas.width / 2 - (barcode.width / 2) * barcode_scale), (canvas.height - 100 - (barcode.height * barcode_scale)), barcode.width * barcode_scale, barcode.height * barcode_scale)
    ctx.drawImage(logo, 35, 735, 100, 100)
    ctx.drawImage(nti, (canvas.width / 2 - (nti.width / 2) * nti_scale), (canvas.height - 350 - (nti.height * nti_scale)), nti.width * nti_scale, nti.height * nti_scale)


    var spacer_margin = 80
    ctx.fillRect(spacer_margin, 300, canvas.width - spacer_margin * 2, 5)
    ctx.font = "30px Georgia"
    ctx.fillText("Developer Title", 80, 350)


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
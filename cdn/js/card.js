

var images = {
    nti: "img/nti.png",
    logo: "img/logo_256_black.png",
    strip: "img/strip.png",
    contactless: "img/contactless.png"
}




function generate_card(card_info) {
    if (!me && !card_info) return
    if (!card_info) card_info = me

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

    var qr = card_info.qr_img ? card_info.qr_img : images.qr
    var qr_scale = 2

    ctx.drawImage(qr, (canvas.width / 2 - (qr.width / 2) * qr_scale), (canvas.height - 75 - (qr.height * qr_scale)), qr.width * qr_scale, qr.height * qr_scale)

    ctx.font = "75px Georgia"
    ctx.fillStyle = "black"
    ctx.fillText(card_info.last_name, 80, 150)
    ctx.fillText(card_info.first_name, 80, 240)

    var nti_scale = .8


    
    ctx.drawImage(logo, 60, 735, 100, 100)
    ctx.drawImage(nti, (canvas.width / 2 - (nti.width / 2) * nti_scale), (canvas.height - 350 - (nti.height * nti_scale)), nti.width * nti_scale, nti.height * nti_scale)

    ctx.drawImage(images.contactless, 470, 120, 100, 100)

    ctx.font = "30px Georgia"
    ctx.fillText(card_info.title, 80, 300)

    return canvas.toDataURL("image/png")
}



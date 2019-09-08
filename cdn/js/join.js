var token = document.getElementById("token").innerText
localStorage.setItem("token", token)

socket.emit("get_titles")
socket.on("titles", titles => {
    var options = ""
    for(title of titles){
        options += `<option value="${title}">${title}</option>`
    }
    document.getElementById("profile-title-choose").innerHTML += options
})

function update_title(el){
    var proceed_button = document.getElementById("ready-button")
    proceed_button.disabled = el.value == ""
}

function submit_title(){
    var title = document.getElementById("profile-title-choose").value
    socket.emit("set_title", {
        title, token
    })
}

socket.on("title_updated", () => {
    location.href = "/dashboard"
})
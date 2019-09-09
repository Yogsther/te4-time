on_login = () => {
    if(!me.admin) location.href = "/dashboard"
}

socket.emit("get_accounts", token)
socket.on("all_users", users => {
    var html = ""
    for(var user of users){
        html+=`<option value="${user.id}">${user.first_name} ${user.last_name}</option>`
    }
    document.getElementById("choose-account").innerHTML += html
})

function link_card(){
    socket.emit("link_card", {
        user: document.getElementById("choose-account").value,
        token: token
    })
}
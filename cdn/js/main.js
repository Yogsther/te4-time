const socket = io.connect()
var me
var on_login = () => {}
var on_login_fail = () => {}
var token = localStorage.getItem("token")

if(token){
    socket.emit("login", token)
}

socket.on("login", data => {
    console.log(data)
    if(data.id){
        me = data
        on_login()
    } else {
        on_login_fail(data)
    }
})

socket.on("err", msg => {
    alert(msg)
})

function logout(){
    localStorage.removeItem("token")
    location.href = "/"
}
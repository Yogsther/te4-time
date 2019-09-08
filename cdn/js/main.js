const socket = io.connect()

socket.on("err", msg => {
    alert(msg)
})
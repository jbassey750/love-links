module.exports = (
io,
socket,
onlineUsers
)=>{


socket.on(
"check-online",
(userId)=>{


const online =
onlineUsers.has(
userId.toString()
);



socket.emit(
"user-status",
{
userId,
online
}
);


}
);



};
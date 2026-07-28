module.exports = (
io,
socket
)=>{


socket.on(
"new-match",
(data)=>{


io.to(
data.userId
)
.emit(
"match-created",
data
);


}
);



socket.on(
"remove-match",
(data)=>{


io.to(
data.userId
)
.emit(
"match-removed",
data
);


}
);


};
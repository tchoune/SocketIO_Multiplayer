const express = require('express')
const app = express()
const http = require('http')
const server = http.createServer(app)
const {Server} = require('socket.io')
const {v4 : uuidv4 } = require('uuid')
const path = require('path')


const io = new Server(server, {
    cors:{
        origin: 'http://localhost:8080',
    }
})


let sequenceNumberByClient = new Map()
let roomList = new Map()


let roomOptions = {
    id:'',
    title:'',
    description :'',
    currentPlayer: 0,
    maxPlayerSize : 12,
    public:true,
    region: 'UE',
    owner:null,
}

app.use(express.static('public'));

app.get('/', (req, res) => {

    res.sendFile(path.join(__dirname, './', 'index.html'))

})

app.get('/serveroff', (req, res) => {
    res.sendFile(path.join(__dirname, './', '/serveroff.html'))
})

app.get('/logout', (req, res) => {
    io.sockets.sockets(socket.id).emit('disconnect')
})

const refreshListServer = () => {

    let tempLobbies = []
        roomList.forEach((element) => {
           if(element.isPublic){
                tempLobbies.push(element)
            }
        });

    return tempLobbies
}


io.on('connection', (socket) => {
    sequenceNumberByClient.set(socket, 1);

    socket.on('room/create', (room) => {

        if([...roomList.values()].find(item => item.title === room.title)){
            socket.emit('room/error', `Le salon est déjà créé !`)
        }
        else{
            room.id = uuidv4()
            room.owner = socket.id
            room.currentPlayer = 1
            room.isPublic = room.isPublic === 'true' ? true : false
            room.region = "UE"
            room.listPlayer = [socket.id]

            socket.join(room.id)
            roomList.set(room.id, room)

            socket.emit('room/error', `Vous avez créé le serveur ${room.title}`)

            setTimeout(() => {
                socket.emit('room/join', room)
                io.sockets.in(room.id).emit('room/refreshPlayer', room)

            }, 1000)
        }
    })

    socket.on('room/join', async (roomId) => {
        if([...roomList.values()].find(item => item.id === roomId)){

            let room = roomList.get(roomId)
            if(room){
                if(!room.listPlayer.includes(socket.id)){

                    if((room.currentPlayer + 1) <= room.maxPlayer){
    
                        room.currentPlayer = room.currentPlayer + 1
                        room.listPlayer.push(socket.id)
    
                        socket.join(roomId)
                        roomList.set(roomId, room)
    
                        await setTimeout(() => {
                            socket.emit('room/join', room)
                            io.sockets.in(room.id).emit('room/refreshPlayer', room)
    
                        }, 1000)
                    }
                    else{
                        socket.emit('room/error', `Le lobbie que vous tentez de rejoindre est complet`)
                    }
                }
                else{
                    socket.emit('room/error', `Vous êtes déjà dans ce serveur !`)
                }
            }
        }
        else
        {
            socket.emit('room/error', `Erreur le salon n'existe plus !`)
        }
    })

    socket.on('room/leave', (roomId) => {

        let tempRoom = roomList.get(roomId)

        tempRoom.listPlayer = tempRoom.listPlayer.filter(e => e !== socket.id)
        tempRoom.currentPlayer = (tempRoom.currentPlayer - 1) <= 0 ? 0 : tempRoom.currentPlayer - 1

        roomList.set(roomId, tempRoom)
        //Envoyer un broadcast pour refresh les player de chacun
        socket.emit('room/leave')
        socket.emit('room/refreshList', refreshListServer())
        io.sockets.in(roomId).emit('room/refreshPlayer', roomList.get(roomId))
        //Envoyer un event pour retourner sur la list des serveurs
    })

    socket.on('room/delete', (roomId, confirmation) => {
        let tempRoom = roomList.get(roomId)
        if(tempRoom.owner === socket.id){
            if(confirmation){
                roomList.delete(roomId)

                io.sockets.in(roomId).emit('room/refreshList', refreshListServer())
                io.sockets.in(roomId).emit('room/deleteRoom')

                socket.leave(roomId)

                socket.emit('room/error', `Vous venez de supprimer le serveur !`)
            }
        }
        else{
            socket.emit('room/error', `Vous n'avez pas les droits pour effectuer cette action !`)
        }
    })

    socket.on('room/refreshList', () => {
        socket.emit('room/refreshList', refreshListServer())
    })

    socket.on('room/messages/send', (message) => {

        if(message !== ''){
            let roomId = 0
            roomList.forEach((element, index) => {
                element.listPlayer.map(item => {
                    if(item === socket.id){
                        roomId = index
                    }
                })
            })
            if(roomId !== 0){
                io.sockets.in(roomId).emit('room/message/lists', {identifiant : socket.id, message: message})
            }
        }
    })

    socket.on("disconnect", () => {
        if(roomList.size > 0){
            let roomIndex;
            roomList.forEach((element, index) => {
                element.listPlayer.map(item => {
                    if(item === socket.id){
                       roomIndex =  index
                    }
                })
            })
    
            let roomTemps = roomList.get(roomIndex)
            if(roomTemps){

                roomTemps.listPlayer = roomTemps.listPlayer.filter(e => e !== socket.id)
                roomTemps.currentPlayer = (roomTemps.currentPlayer - 1) <= 0 ? 0 : roomTemps.currentPlayer - 1

                roomList.set(roomIndex, roomTemps)
                //Envoyer un broadcast pour refresh les player de chacun
                io.sockets.in(roomIndex).emit('room/refreshPlayer', roomList.get(roomIndex))
            }
        }
        sequenceNumberByClient.delete(socket);        
    })

    socket.on('server/refresh', () => {
        socket.emit('client/refresh', {onlinePlayer:sequenceNumberByClient.size})
    })
})


server.listen(8080, () => {
    console.log(`Welcom to my authentification server : 8080`)
});
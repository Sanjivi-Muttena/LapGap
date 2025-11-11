// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // allow all connections for testing
});

// Store data for each race session
const races = {}; // { raceId: { cars: { socketId: {name, lat, lng, speed, lastUpdate} } } }

// Utility to calculate distance (meters) between two lat/lng points
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('joinRace', ({ raceId, name }) => {
    if (!races[raceId]) races[raceId] = { cars: {} };
    races[raceId].cars[socket.id] = { name, lat: 0, lng: 0, speed: 0, lastUpdate: Date.now() };
    socket.join(raceId);
    console.log(`${name} joined ${raceId}`);
  });

  socket.on('updatePosition', ({ lat, lng, speed }) => {
    for (const raceId in races) {
      const race = races[raceId];
      if (race.cars[socket.id]) {
        race.cars[socket.id].lat = lat;
        race.cars[socket.id].lng = lng;
        race.cars[socket.id].speed = speed;
        race.cars[socket.id].lastUpdate = Date.now();

        // Calculate distances and time gaps
        const cars = Object.entries(race.cars).map(([id, car]) => ({ id, ...car }));
        const leader = cars[0];
        cars.forEach(car => {
          if (car.id !== leader.id) {
            const dist = haversine(leader.lat, leader.lng, car.lat, car.lng);
            const gapSec = car.speed ? (dist / car.speed).toFixed(1) : 0;
            car.dist = Math.round(dist);
            car.gapSec = gapSec;
          } else {
            car.dist = 0;
            car.gapSec = 0;
          }
        });

        io.to(raceId).emit('leaderboard', cars);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    for (const raceId in races) {
      delete races[raceId].cars[socket.id];
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🏁 RaceGap server running on port ${PORT}`);
});
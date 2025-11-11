// simulator.js
const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';
const RACE_ID = 'race123';

// Create two simulated cars
const car1 = io(SERVER_URL);
const car2 = io(SERVER_URL);

// Starting positions (near each other)
let car1Pos = { lat: 37.7749, lng: -122.4194, speed: 25 }; // m/s (~90 km/h)
let car2Pos = { lat: 37.7750, lng: -122.4193, speed: 24.5 }; // a little slower

// Join the race
car1.emit('joinRace', { raceId: RACE_ID, name: 'Car A' });
car2.emit('joinRace', { raceId: RACE_ID, name: 'Car B' });

// Listen for leaderboard updates
car1.on('leaderboard', data => {
  console.clear();
  console.log('🏁 Race Leaderboard');
  console.table(
    data.map(c => ({
      Name: c.name,
      Dist_m: c.dist ?? 0,
      Gap_s: c.gapSec ?? 0,
      Speed_mps: (c.speed ?? 0).toFixed(1),
    }))
  );
});

// Simulate simple forward movement every second
setInterval(() => {
  car1Pos.lat += 0.00002; // move slightly north
  car2Pos.lat += 0.000018; // move a bit slower north

  car1.emit('updatePosition', car1Pos);
  car2.emit('updatePosition', car2Pos);
}, 1000);
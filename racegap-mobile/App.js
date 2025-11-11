import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Button, TextInput, Dimensions, Alert } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker, Circle } from 'react-native-maps';
import io from 'socket.io-client';

const SERVER_URL = 'http://192.168.50.227:3000'; // replace with your local server IP
const RACE_ID = 'race123';
const START_RADIUS = 0.0001; // about 10 m

export default function App() {
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [position, setPosition] = useState(null);
  const [cars, setCars] = useState([]);
  const [delta, setDelta] = useState(null);
  const [lapCount, setLapCount] = useState(0);
  const [lapTimes, setLapTimes] = useState([]);
  const [lapStartTime, setLapStartTime] = useState(null);
  const [startLine, setStartLine] = useState(null);
  const [showSetup, setShowSetup] = useState(false); // 👈 NEW screen state

  const socketRef = useRef(null);
  const mapRef = useRef(null);
  const hasCrossedLine = useRef(false);

  // Join Race
  const joinRace = async () => {
    if (!startLine) {
      Alert.alert('Set Start Line First', 'Tap “📍 Set Start Line” before joining.');
      return;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      alert('Permission denied for GPS');
      return;
    }

    const socket = io(SERVER_URL, { transports: ['websocket'] });
    socket.emit('joinRace', { raceId: RACE_ID, name });
    socketRef.current = socket;
    setJoined(true);

    socket.on('leaderboard', (data) => {
      setCars(data);
      updateDelta(data);
    });

    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,
        distanceInterval: 0,
      },
      (loc) => {
        const { latitude, longitude, speed } = loc.coords;
        const newPos = { lat: latitude, lng: longitude, speed: speed || 0 };
        setPosition(newPos);
        socket.emit('updatePosition', newPos);
        checkLapCross(newPos);

        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude,
            longitude,
            latitudeDelta: 0.001,
            longitudeDelta: 0.001,
          });
        }
      }
    );

    setLapStartTime(Date.now());
  };

  const updateDelta = (data) => {
    if (!name || data.length === 0) return;
    const sorted = [...data].sort((a, b) => a.dist - b.dist);
    const me = sorted.find((c) => c.name === name);
    if (!me) return;

    const index = sorted.findIndex((c) => c.name === name);
    if (index === 0) {
      setDelta({ text: '🥇 You’re leading!', color: '#0f0' });
    } else {
      const ahead = sorted[index - 1];
      const gap = ahead.gapSec ?? 0;
      setDelta({
        text: `+${gap.toFixed(1)}s behind ${ahead.name}`,
        color: '#ff0',
      });
    }
  };

  const checkLapCross = (pos) => {
    if (!pos || !startLine) return;
    const d = distanceBetween(pos.lat, pos.lng, startLine.lat, startLine.lng);
    const inside = d < START_RADIUS * 111000;

    if (inside && !hasCrossedLine.current) {
      hasCrossedLine.current = true;

      if (lapStartTime) {
        const now = Date.now();
        const lapTime = (now - lapStartTime) / 1000;
        setLapTimes((prev) => [...prev, lapTime]);
        setLapCount((prev) => prev + 1);
        setLapStartTime(now);
      } else {
        setLapStartTime(Date.now());
      }
    } else if (!inside) {
      hasCrossedLine.current = false;
    }
  };

  const distanceBetween = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const formatTime = (t) => `${(t / 60).toFixed(0)}:${(t % 60).toFixed(1)}`;
  const bestLap = lapTimes.length ? Math.min(...lapTimes).toFixed(2) : '--';

  // 👇 NEW: Setup screen map for start line selection
  if (showSetup) {
    return (
      <View style={{ flex: 1 }}>
        <MapView
          style={{ flex: 1 }}
          initialRegion={{
            latitude: position?.lat || 37.7749,
            longitude: position?.lng || -122.4194,
            latitudeDelta: 0.001, // closer zoom
            longitudeDelta: 0.001,
          }}
          onPress={(e) => {
            const { latitude, longitude } = e.nativeEvent.coordinate;
            setStartLine({ lat: latitude, lng: longitude });
          }}
        >
          {startLine && (
            <>
              <Marker coordinate={startLine} pinColor="green" />
              <Circle
                center={startLine}
                radius={START_RADIUS * 111000}
                strokeColor="green"
                fillColor="rgba(0,255,0,0.2)"
              />
            </>
          )}
        </MapView>
        <View style={styles.setupButtons}>
          <Button title="✅ Confirm Start Line" onPress={() => setShowSetup(false)} />
          <Button title="❌ Cancel" color="red" onPress={() => setShowSetup(false)} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!joined ? (
        <>
          <Text style={styles.title}>🏎 RaceGap Tracker</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your car name"
            placeholderTextColor="#888"
            value={name}
            onChangeText={setName}
          />

          <Button
            title="📍 Set Start Line"
            onPress={async () => {
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Location permission denied');
                return;
              }
              const loc = await Location.getCurrentPositionAsync({});
              setPosition({ lat: loc.coords.latitude, lng: loc.coords.longitude });
              setShowSetup(true);
            }}
          />

          {startLine && (
            <Text style={{ color: '#aaa', marginTop: 10 }}>
              Start: {startLine.lat.toFixed(5)}, {startLine.lng.toFixed(5)}
            </Text>
          )}

          <Button title="Join Race" onPress={joinRace} />
        </>
      ) : (
        <>
          {position ? (
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={{
                latitude: position.lat,
                longitude: position.lng,
                latitudeDelta: 0.001,
                longitudeDelta: 0.001,
              }}
            >
              {startLine && (
                <>
                  <Marker coordinate={startLine} title="Start/Finish Line" pinColor="green" />
                  <Circle
                    center={startLine}
                    radius={START_RADIUS * 111000}
                    strokeColor="green"
                    fillColor="rgba(0,255,0,0.2)"
                  />
                </>
              )}
              {cars.map((car) => (
                <Marker
                  key={car.id}
                  coordinate={{
                    latitude: car.lat ?? 0,
                    longitude: car.lng ?? 0,
                  }}
                  title={`${car.name}`}
                  description={`Gap: ${car.gapSec ?? 0}s`}
                  pinColor={car.name === name ? 'red' : 'blue'}
                />
              ))}
            </MapView>
          ) : (
            <Text style={{ color: '#fff' }}>Getting GPS...</Text>
          )}

          {delta && (
            <View style={[styles.deltaBox, { borderColor: delta.color }]}>
              <Text style={[styles.deltaText, { color: delta.color }]}>
                {delta.text}
              </Text>
            </View>
          )}

          <View style={styles.lapOverlay}>
            <Text style={styles.lapText}>Lap: {lapCount}</Text>
            <Text style={styles.lapText}>
              Last Lap: {lapTimes.length ? formatTime(lapTimes[lapTimes.length - 1]) : '--'}
            </Text>
            <Text style={styles.lapText}>Best: {bestLap}s</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, color: '#fff', marginBottom: 20 },
  input: {
    width: '70%',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    color: '#fff',
    padding: 10,
    marginBottom: 20,
  },
  map: { width: Dimensions.get('window').width, height: Dimensions.get('window').height },
  setupButtons: {
    position: 'absolute',
    bottom: 30,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  deltaBox: {
    position: 'absolute',
    top: 40,
    alignSelf: 'center',
    borderWidth: 2,
    borderRadius: 10,
    backgroundColor: '#000a',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  deltaText: { fontSize: 18, fontWeight: 'bold' },
  lapOverlay: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: '#000a',
    padding: 10,
    borderRadius: 10,
  },
  lapText: { color: '#0f0', fontSize: 16, fontWeight: 'bold' },
});
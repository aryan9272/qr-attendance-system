const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  try {
    const connStr = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/qr_attendance';
    mongoose.set('strictQuery', false);
    
    // Connect with a short 2s timeout so backend starts instantly even if local MongoDB daemon is inactive
    await mongoose.connect(connStr, {
      serverSelectionTimeoutMS: 2000,
    });

    isConnected = true;
    console.log(`[MongoDB] Connected successfully: ${mongoose.connection.host}`);
  } catch (error) {
    isConnected = false;
    // Disable buffering so queries fail-fast (0ms) and fall back to in-memory mode
    mongoose.set('bufferCommands', false);
    console.warn(`[MongoDB Warning] Could not connect to MongoDB (${error.message}). Running in hybrid/in-memory fallback mode.`);
  }
};

const getIsConnected = () => isConnected;

module.exports = { connectDB, getIsConnected };

const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    user: {
      type: String,
      required: true,
      trim: true,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
    },
    regNo: {
      type: String,
      trim: true,
    },
    year: {
      type: String,
      trim: true,
    },
    branch: {
      type: String,
      trim: true,
    },
    mobileNumber: {
      type: String,
      trim: true,
      default: '',
    },
    customData: {
      type: Object,
      default: {},
    },
    event: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },
    distanceFromTargetMeters: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['VERIFIED', 'FAILED_GEOFENCE', 'EXPIRED_TOKEN', 'DUPLICATE'],
      default: 'VERIFIED',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound Unique Index: Prevents a student from marking attendance twice for the same event
attendanceSchema.index({ user: 1, event: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
